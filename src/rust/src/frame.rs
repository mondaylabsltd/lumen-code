//! Packets, the file descriptor, and codewords <-> cells (PROTOCOL §7–§8).

use crate::layout::{cells_per_codeword, pack_header, Header, Layout, K_FIXED, K_MARKER, MODES};
use crate::rs;
use crate::util::{crc16, mix32};

pub const IDX_INK: u8 = 8;
pub const IDX_PAPER: u8 = 9;

pub const PKT_HDR: usize = 5;
pub const PKT_OVERHEAD: usize = PKT_HDR + 2;
pub const MAX_SBN: u32 = 127;
pub const MAX_BLOCKS: u64 = MAX_SBN as u64 + 1;
pub const MAX_BLOCK_SYMBOLS: u64 = 16384;
pub const DESC_FIXED: usize = 15;
pub const FLAG_DEFLATE: u8 = 1;

pub fn packet_data_size(n: usize, nsym: usize) -> usize {
    n - nsym - PKT_OVERHEAD
}

pub fn write_packet_header(buf: &mut [u8], tid: u16, sbn: u32, esi: u32, meta: bool) {
    buf[0] = (tid >> 8) as u8;
    buf[1] = tid as u8;
    buf[2] = if meta { 0x80 } else { 0 } | (sbn as u8 & 0x7f);
    buf[3] = (esi >> 8) as u8;
    buf[4] = esi as u8;
}

pub fn seal_packet(msg: &mut [u8]) {
    let n = msg.len();
    let c = crc16(&msg[..n - 2]);
    msg[n - 2] = (c >> 8) as u8;
    msg[n - 1] = c as u8;
}

pub fn packet_intact(msg: &[u8]) -> bool {
    let n = msg.len();
    n >= PKT_OVERHEAD && crc16(&msg[..n - 2]) == ((msg[n - 2] as u16) << 8 | msg[n - 1] as u16)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PacketId {
    pub tid: u16,
    pub meta: bool,
    pub sbn: u32,
    pub esi: u32,
}

pub fn read_packet(buf: &[u8]) -> (PacketId, &[u8]) {
    let id = PacketId {
        tid: (buf[0] as u16) << 8 | buf[1] as u16,
        meta: buf[2] & 0x80 != 0,
        sbn: (buf[2] & 0x7f) as u32,
        esi: (buf[3] as u32) << 8 | buf[4] as u32,
    };
    (id, &buf[PKT_HDR..buf.len() - 2])
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Descriptor {
    pub flags: u8,
    pub payload_length: u32,
    pub file_size: u32,
    pub crc: u32,
    pub name: String,
    /// TLV records (type, value) of a received descriptor, known or not. Version 1 defines
    /// no types, so the encoder writes none.
    pub records: Vec<(u8, Vec<u8>)>,
}

fn utf8_truncate(bytes: &[u8], max: usize) -> &[u8] {
    if bytes.len() <= max {
        return bytes;
    }
    let mut end = max;
    while end > 0 && (bytes[end] & 0xc0) == 0x80 {
        end -= 1;
    }
    &bytes[..end]
}

pub fn encode_descriptor(d: &Descriptor, t: usize) -> Vec<u8> {
    let mut out = vec![0u8; t];
    let name = utf8_truncate(d.name.as_bytes(), 255.min(t.saturating_sub(DESC_FIXED)));
    out[0] = 1;
    out[1] = d.flags;
    out[2..6].copy_from_slice(&d.payload_length.to_be_bytes());
    out[6..10].copy_from_slice(&d.file_size.to_be_bytes());
    out[10..14].copy_from_slice(&d.crc.to_be_bytes());
    out[14] = name.len() as u8;
    out[DESC_FIXED..DESC_FIXED + name.len()].copy_from_slice(name);
    out
}

/// Why a descriptor is not valid (§8.4): the first rule that fails.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DescriptorError {
    Version,
    Flags,
    NameLength,
    NameUtf8,
    Tlv,
    /// L != F without compression
    Length,
    /// more than 128 source blocks
    Blocks,
}

/// Descriptor validity (§8.4). `data` is the T payload bytes of metadata packet 0.
pub fn parse_descriptor(data: &[u8]) -> Result<Descriptor, DescriptorError> {
    let t = data.len();
    if t < DESC_FIXED || data[0] != 1 {
        return Err(DescriptorError::Version);
    }
    let flags = data[1];
    if flags & !FLAG_DEFLATE != 0 {
        return Err(DescriptorError::Flags);
    }
    let nl = data[14] as usize;
    if nl > t - DESC_FIXED {
        return Err(DescriptorError::NameLength);
    }
    let name = std::str::from_utf8(&data[DESC_FIXED..DESC_FIXED + nl]).map_err(|_| DescriptorError::NameUtf8)?.to_string();
    let mut records = Vec::new();
    let mut p = DESC_FIXED + nl;
    while p < t && data[p] != 0 {
        if p + 2 > t || p + 2 + data[p + 1] as usize > t {
            return Err(DescriptorError::Tlv);
        }
        let len = data[p + 1] as usize;
        records.push((data[p], data[p + 2..p + 2 + len].to_vec()));
        p += 2 + len;
    }
    let u32at = |o: usize| u32::from_be_bytes([data[o], data[o + 1], data[o + 2], data[o + 3]]);
    let (payload_length, file_size) = (u32at(2), u32at(6));
    if flags & FLAG_DEFLATE == 0 && payload_length != file_size {
        return Err(DescriptorError::Length);
    }
    let kt = (payload_length as u64).div_ceil(t as u64).max(1);
    if kt.div_ceil(MAX_BLOCK_SYMBOLS) > MAX_BLOCKS {
        return Err(DescriptorError::Blocks);
    }
    Ok(Descriptor { flags, payload_length, file_size, crc: u32at(10), name, records })
}

pub fn decode_descriptor(data: &[u8]) -> Option<Descriptor> {
    parse_descriptor(data).ok()
}

/// Cell values of one frame: data cells hold palette indices, all others IDX_INK / IDX_PAPER.
/// `messages` are RS messages of k = n - nsym bytes; parity is added here.
pub fn encode_frame_cells(layout: &Layout, mode: usize, n: usize, nsym: usize, seq: u32, messages: &[Vec<u8>]) -> Vec<u8> {
    let bpc = MODES[mode].bpc;
    let mask = (1u32 << bpc) - 1;
    let mut cells = vec![0u8; layout.x * layout.y];
    for i in 0..cells.len() {
        let k = layout.kind[i];
        if k == K_FIXED || k == K_MARKER {
            cells[i] = if layout.fixed[i] != 0 { IDX_PAPER } else { IDX_INK };
        }
    }
    let h = Header { mode: mode as u32, x: layout.x as u32, y: layout.y as u32, n: n as u32, nsym: nsym as u32, seq };
    for (copy, cellsof) in layout.headers.iter().enumerate() {
        let bits = pack_header(&h, copy);
        for (b, &ci) in cellsof.iter().enumerate() {
            cells[ci as usize] = if bits[b] != 0 { IDX_PAPER } else { IDX_INK };
        }
    }
    let cpc = cells_per_codeword(n, bpc);
    let mut slot = 0usize;
    for msg in messages {
        let cw = rs::encode(msg, nsym);
        let (mut acc, mut acc_bits, mut byte) = (0u32, 0u32, 0usize);
        for _ in 0..cpc {
            while acc_bits < bpc {
                acc = (acc << 8) | if byte < n { cw[byte] as u32 } else { 0 };
                byte += 1;
                acc_bits += 8;
            }
            let sym = (acc >> (acc_bits - bpc)) & mask;
            acc_bits -= bpc;
            acc &= (1u32 << acc_bits) - 1;
            cells[layout.data_order[slot] as usize] = (sym ^ (layout.whiten[slot] as u32 & mask)) as u8;
            slot += 1;
        }
    }
    // filler
    let mut r = mix32(seq.wrapping_add(0x0123_4567));
    while slot < layout.data_order.len() {
        r = mix32(r.wrapping_add(slot as u32));
        cells[layout.data_order[slot] as usize] = (r & mask) as u8;
        slot += 1;
    }
    cells
}

pub struct Codeword {
    pub index: usize,
    pub ok: bool,
    pub skipped: bool,
    pub corrected: usize,
    /// the k-byte packet when ok
    pub bytes: Option<Vec<u8>>,
}

/// symbols: raw symbol per data slot (before un-whitening); conf: confidence per slot.
pub fn decode_codewords(
    layout: &Layout,
    mode: usize,
    n: usize,
    nsym: usize,
    symbols: &[u8],
    conf: &[f32],
    count: usize,
    skip: &[bool],
) -> Vec<Codeword> {
    decode_codewords_with(layout, mode, n, nsym, symbols, conf, count, skip, false)
}

/// A cell this close to two colours is as good as unread.
const UNSURE: f32 = 0.1;

/// [`decode_codewords`]. With `triage`, a codeword in which more than a sixth of the cells
/// are unsure gets one attempt and no retries with erasures. Such a codeword lies where the
/// screen was changing frames during the exposure: on phone captures of 60 frames a second,
/// every codeword that decoded had fewer than an eighth of its cells unsure, and half of
/// those that failed had more than a sixth. The retries are a third of the decoding work.
pub fn decode_codewords_with(
    layout: &Layout,
    mode: usize,
    n: usize,
    nsym: usize,
    symbols: &[u8],
    conf: &[f32],
    count: usize,
    skip: &[bool],
    triage: bool,
) -> Vec<Codeword> {
    let bpc = MODES[mode].bpc as usize;
    let mask = (1u8 << bpc) - 1;
    let cpc = cells_per_codeword(n, bpc as u32);
    let mut out = Vec::with_capacity(count);
    let mut cw = vec![0u8; n];
    let mut work = vec![0u8; n];
    let mut idx: Vec<usize> = Vec::with_capacity(n);
    // one spare byte: the last cell's unused bits fall into it
    let mut byte_conf = vec![0f32; n + 1];
    for j in 0..count {
        if skip.get(j).copied().unwrap_or(false) {
            out.push(Codeword { index: j, ok: false, skipped: true, corrected: 0, bytes: None });
            continue;
        }
        cw.fill(0);
        byte_conf.fill(f32::MAX);
        // the cells' bits in a row, most significant first; a byte is as sure as the least
        // sure cell with a bit in it
        let (mut acc, mut held, mut byte) = (0u32, 0usize, 0usize);
        let mut unsure = 0usize;
        let cells = j * cpc..(j + 1) * cpc;
        for ((&raw, &white), &cf) in symbols[cells.clone()].iter().zip(&layout.whiten[cells.clone()]).zip(&conf[cells]) {
            acc = (acc << bpc) | ((raw ^ white) & mask) as u32;
            held += bpc;
            unsure += (cf < UNSURE) as usize;
            // the byte these bits start in, and the next when they run over
            if cf < byte_conf[byte] {
                byte_conf[byte] = cf;
            }
            if held >= 8 {
                held -= 8;
                if byte < n {
                    cw[byte] = (acc >> held) as u8;
                }
                byte += 1;
                if held > 0 && byte <= n && cf < byte_conf[byte] {
                    byte_conf[byte] = cf;
                }
            }
        }
        if held > 0 && byte < n {
            cw[byte] = (acc << (8 - held)) as u8;
        }
        // the syndromes are worked out once; every attempt starts from them
        work.copy_from_slice(&cw);
        let mut res = Some(0);
        if let Some(syn) = rs::syndromes(&cw, nsym) {
            res = rs::correct(&mut work, nsym, &syn, &[]);
            if res.is_none() && !(triage && 6 * unsure > cpc) {
                // retry with the least confident bytes as erasures; keep >= nsym/2 redundancy
                idx.clear();
                idx.extend(0..n);
                idx.sort_by(|&a, &b| byte_conf[a].partial_cmp(&byte_conf[b]).unwrap_or(std::cmp::Ordering::Equal));
                for f in [nsym >> 2, nsym >> 1] {
                    if f == 0 {
                        continue;
                    }
                    work.copy_from_slice(&cw);
                    if let Some(r2) = rs::correct(&mut work, nsym, &syn, &idx[..f]) {
                        res = Some(r2);
                        break;
                    }
                }
            }
        }
        let k = n - nsym;
        let ok = res.is_some() && packet_intact(&work[..k]);
        out.push(Codeword { index: j, ok, skipped: false, corrected: res.unwrap_or(0), bytes: if ok { Some(work[..k].to_vec()) } else { None } });
    }
    out
}
