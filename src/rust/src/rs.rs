//! Reed–Solomon over GF(256), primitive polynomial 0x11D, generator roots α^0 … α^(nsym−1).
//! Systematic encoding. Decoding corrects e errors and f erasures when 2e + f <= nsym.
//!
//! The arithmetic runs on tables built once: the full product table, and per `nsym` the
//! multiples of the generator polynomial. Dividing by the generator with those multiples
//! (one row XOR per byte) gives the parity when encoding and, when decoding, the remainder:
//! zero for a clean codeword, and otherwise all that the syndromes need.

use std::sync::OnceLock;

const fn make_tables() -> ([u8; 512], [u8; 256]) {
    let mut exp = [0u8; 512];
    let mut log = [0u8; 256];
    let mut x: u32 = 1;
    let mut i = 0;
    while i < 255 {
        exp[i] = x as u8;
        log[x as usize] = i as u8;
        x <<= 1;
        if x & 0x100 != 0 {
            x ^= 0x11d;
        }
        i += 1;
    }
    while i < 512 {
        exp[i] = exp[i - 255];
        i += 1;
    }
    (exp, log)
}
static TABLES: ([u8; 512], [u8; 256]) = make_tables();

#[inline]
fn exp(i: usize) -> u8 {
    TABLES.0[i]
}
#[inline]
fn log(x: u8) -> usize {
    TABLES.1[x as usize] as usize
}
#[inline]
pub fn gf_mul(a: u8, b: u8) -> u8 {
    if a == 0 || b == 0 {
        0
    } else {
        exp(log(a) + log(b))
    }
}
#[inline]
fn gf_inv(a: u8) -> u8 {
    exp(255 - log(a))
}

type MulTable = [[u8; 256]; 256];

/// Every product in GF(256): `mul()[a][b]`.
fn mul() -> &'static MulTable {
    static MUL: OnceLock<Box<MulTable>> = OnceLock::new();
    MUL.get_or_init(|| {
        let mut t: Box<MulTable> = vec![[0u8; 256]; 256].into_boxed_slice().try_into().expect("256 rows");
        for a in 1..256 {
            for b in 1..256 {
                t[a][b] = exp(log(a as u8) + log(b as u8));
            }
        }
        t
    })
}

/// The generator polynomial of `nsym` parity bytes, and its multiples.
struct Code {
    nsym: usize,
    /// Row c: c · g(x) without the leading term, highest degree first (`nsym` bytes).
    rows: Vec<u8>,
}

impl Code {
    #[inline]
    fn row(&self, c: u8) -> &[u8] {
        &self.rows[c as usize * self.nsym..(c as usize + 1) * self.nsym]
    }
}

/// Generator polynomial coefficients, highest degree first, leading 1 omitted.
fn generator(nsym: usize) -> Vec<u8> {
    let mut p: Vec<u8> = vec![1];
    for i in 0..nsym {
        let mut q = vec![0u8; p.len() + 1];
        for j in 0..p.len() {
            q[j] ^= p[j];
            q[j + 1] ^= gf_mul(p[j], exp(i));
        }
        p = q;
    }
    p[1..].to_vec()
}

fn code(nsym: usize) -> &'static Code {
    #[allow(clippy::declare_interior_mutable_const)]
    const EMPTY: OnceLock<Code> = OnceLock::new();
    static CODES: [OnceLock<Code>; 256] = [EMPTY; 256];
    CODES[nsym].get_or_init(|| {
        let g = generator(nsym);
        let mut rows = vec![0u8; 256 * nsym];
        for c in 1..256 {
            for j in 0..nsym {
                rows[c * nsym + j] = gf_mul(c as u8, g[j]);
            }
        }
        Code { nsym, rows }
    })
}

/// Divides `buf` (a polynomial, highest degree first) by the generator in place: afterwards
/// its last `nsym` bytes hold the remainder. The bytes before them are overwritten.
#[inline]
fn divide(code: &Code, buf: &mut [u8]) {
    let nsym = code.nsym;
    for i in 0..buf.len() - nsym {
        let c = buf[i];
        if c != 0 {
            for (b, &g) in buf[i + 1..i + 1 + nsym].iter_mut().zip(code.row(c)) {
                *b ^= g;
            }
        }
    }
}

/// Returns `msg` followed by `nsym` parity bytes.
pub fn encode(msg: &[u8], nsym: usize) -> Vec<u8> {
    let mut out = Vec::with_capacity(msg.len() + nsym);
    out.extend_from_slice(msg);
    out.resize(msg.len() + nsym, 0);
    if nsym == 0 || nsym > 255 {
        return out;
    }
    // the parity is the remainder of msg · x^nsym
    divide(code(nsym), &mut out);
    out[..msg.len()].copy_from_slice(msg);
    out
}

/// The syndromes S_j = cw(α^j), j < nsym, of a codeword (highest degree first).
/// `None`: all zero, the codeword is valid as it is.
pub struct Syndromes {
    s: [u8; 255],
}

/// Syndromes of `cw`, or `None` when it is a valid codeword. `nsym` must be below `cw.len()`
/// and at most 255.
pub fn syndromes(cw: &[u8], nsym: usize) -> Option<Syndromes> {
    let n = cw.len();
    let mut out = Syndromes { s: [0; 255] };
    if nsym == 0 {
        return None;
    }
    if nsym >= n || nsym > 255 {
        // no room for a division: evaluate directly
        let m = mul();
        let mut nonzero = false;
        for j in 0..nsym.min(255) {
            let row = &m[exp(j) as usize];
            let mut acc = 0u8;
            for &c in cw {
                acc = row[acc as usize] ^ c;
            }
            out.s[j] = acc;
            nonzero |= acc != 0;
        }
        return nonzero.then_some(out);
    }
    // cw(α^j) = r(α^j) for the remainder r of cw by the generator, whose roots the α^j are
    let mut buf = [0u8; 255 + 255];
    let buf = &mut buf[..n];
    buf.copy_from_slice(cw);
    divide(code(nsym), buf);
    let r = &buf[n - nsym..];
    if r.iter().all(|&b| b == 0) {
        return None;
    }
    let m = mul();
    for j in 0..nsym {
        let row = &m[exp(j) as usize];
        let mut acc = 0u8;
        for &c in r {
            acc = row[acc as usize] ^ c;
        }
        out.s[j] = acc;
    }
    Some(out)
}

/// Decode in place. Returns the number of corrected positions, or None on failure.
pub fn decode(cw: &mut [u8], nsym: usize, erasures: &[usize]) -> Option<usize> {
    if cw.len() > 255 || nsym > 255 {
        return None; // not a codeword of this field
    }
    match syndromes(cw, nsym) {
        None => Some(0),
        Some(s) => correct(cw, nsym, &s, erasures),
    }
}

/// Corrects `cw` in place from its syndromes (as [`syndromes`] gave them for these bytes),
/// taking the positions in `erasures` as unreliable. Returns the number of corrected
/// positions, or None on failure (`cw` is then unspecified).
pub fn correct(cw: &mut [u8], nsym: usize, syn: &Syndromes, erasures: &[usize]) -> Option<usize> {
    let n = cw.len();
    let ne = erasures.len();
    if ne > nsym || n > 255 || nsym > 255 {
        return None;
    }
    let s = &syn.s[..nsym];
    let m = mul();
    // erasure locator (degree ne; at most nsym + 1 coefficients ever)
    let mut lambda = [0u8; 257];
    let mut llen = 1usize;
    lambda[0] = 1;
    for &pos in erasures {
        let row = &m[exp((n - 1 - pos) % 255) as usize];
        // (1 + x·X) · λ, from the top down so that every term is read before it is written
        for i in (1..=llen).rev() {
            lambda[i] ^= row[lambda[i - 1] as usize];
        }
        llen += 1;
    }
    // Berlekamp–Massey with erasures
    let mut b = lambda;
    let mut blen = llen;
    let mut l = ne;
    let mut t = [0u8; 257];
    for r in (ne + 1)..=nsym {
        let mut delta = 0u8;
        for i in 0..=l.min(llen - 1).min(r - 1) {
            delta ^= m[lambda[i] as usize][s[r - 1 - i] as usize];
        }
        // b <- x·b
        b.copy_within(0..blen, 1);
        b[0] = 0;
        blen += 1;
        if delta == 0 {
            continue;
        }
        let len = llen.max(blen);
        let row = &m[delta as usize];
        t[..len].copy_from_slice(&lambda[..len]);
        for i in 0..blen {
            t[i] ^= row[b[i] as usize];
        }
        if 2 * l < r + ne {
            let inv = &m[gf_inv(delta) as usize];
            for i in 0..llen {
                b[i] = inv[lambda[i] as usize];
            }
            b[llen..blen.max(llen)].fill(0);
            blen = llen;
            l = r + ne - l;
        }
        lambda[..len].copy_from_slice(&t[..len]);
        llen = len;
    }
    while llen > 1 && lambda[llen - 1] == 0 {
        llen -= 1;
    }
    let lambda = &lambda[..llen];
    let deg = llen - 1;
    if deg != l || 2 * (l - ne.min(l)) + ne > nsym {
        return None;
    }
    // Chien search: λ(α^-k) for k = n-1-p, term i stepping by α^-i
    let mut pos = [0u8; 255];
    let mut found = 0usize;
    let mut terms = [0u8; 256];
    terms[..llen].copy_from_slice(lambda);
    let mut steps: [&[u8; 256]; 256] = [&m[1]; 256];
    for (i, st) in steps.iter_mut().enumerate().take(llen) {
        *st = &m[exp((255 - i % 255) % 255) as usize];
    }
    for k in 0..n {
        let mut sum = 0u8;
        for i in 0..llen {
            sum ^= terms[i];
            terms[i] = steps[i][terms[i] as usize];
        }
        if sum == 0 {
            if found == deg {
                return None; // more roots than the degree allows
            }
            pos[found] = (n - 1 - k) as u8;
            found += 1;
        }
    }
    if found != deg {
        return None;
    }
    // ascending positions, as the search over p = 0..n found them
    let pos = &mut pos[..found];
    pos.reverse();
    // Ω = S·Λ mod x^nsym ; Λ' (odd terms)
    let mut omega = [0u8; 255];
    for i in 0..llen.min(nsym) {
        if lambda[i] == 0 {
            continue;
        }
        let row = &m[lambda[i] as usize];
        for j in 0..nsym - i {
            omega[i + j] ^= row[s[j] as usize];
        }
    }
    let omega = &omega[..nsym];
    let mut dl = [0u8; 256];
    let mut i = 1;
    while i < llen {
        dl[i - 1] = lambda[i];
        i += 2;
    }
    let dl = &dl[..llen];
    let eval = |p: &[u8], x: u8| -> u8 {
        let row = &m[x as usize];
        let mut y = 0u8;
        for &c in p.iter().rev() {
            y = row[y as usize] ^ c;
        }
        y
    };
    for &p in pos.iter() {
        let p = p as usize;
        let x = exp((n - 1 - p) % 255);
        let xinv = gf_inv(x);
        let num = eval(omega, xinv);
        let den = eval(dl, xinv);
        if den == 0 {
            return None;
        }
        cw[p] ^= m[x as usize][m[num as usize][gf_inv(den) as usize] as usize];
    }
    if syndromes(cw, nsym).is_some() {
        return None;
    }
    Some(found)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The decoder this module had before the tables: the reference for every result.
    mod reference {
        use super::super::{exp, gf_inv, gf_mul, log};

        fn syndromes(cw: &[u8], nsym: usize, s: &mut [u8]) -> bool {
            let mut nonzero = false;
            for j in 0..nsym {
                let mut acc = 0u8;
                for &c in cw {
                    acc = (if acc != 0 { exp(log(acc) + j) } else { 0 }) ^ c;
                }
                s[j] = acc;
                nonzero |= acc != 0;
            }
            nonzero
        }

        fn poly_eval(p: &[u8], x: u8) -> u8 {
            let mut y = 0u8;
            for i in (0..p.len()).rev() {
                y = (if y != 0 && x != 0 { exp(log(y) + log(x)) } else { 0 }) ^ p[i];
            }
            y
        }

        pub fn encode(msg: &[u8], nsym: usize) -> Vec<u8> {
            let mut p: Vec<u8> = vec![1];
            for i in 0..nsym {
                let mut q = vec![0u8; p.len() + 1];
                for j in 0..p.len() {
                    q[j] ^= p[j];
                    q[j + 1] ^= gf_mul(p[j], exp(i));
                }
                p = q;
            }
            let mut par = vec![0u8; nsym + 1];
            for &m in msg {
                let coef = m ^ par[0];
                par.copy_within(1.., 0);
                par[nsym - 1] = 0;
                for j in 0..nsym {
                    par[j] ^= gf_mul(coef, p[j + 1]);
                }
            }
            let mut out = msg.to_vec();
            out.extend_from_slice(&par[..nsym]);
            out
        }

        pub fn decode(cw: &mut [u8], nsym: usize, erasures: &[usize]) -> Option<usize> {
            let n = cw.len();
            let mut s = vec![0u8; nsym];
            if !syndromes(cw, nsym, &mut s) {
                return Some(0);
            }
            let ne = erasures.len();
            if ne > nsym {
                return None;
            }
            let mut lambda: Vec<u8> = vec![1];
            for &pos in erasures {
                let x = exp((n - 1 - pos) % 255);
                let mut q = vec![0u8; lambda.len() + 1];
                for i in 0..lambda.len() {
                    q[i] ^= lambda[i];
                    q[i + 1] ^= gf_mul(lambda[i], x);
                }
                lambda = q;
            }
            let mut b = lambda.clone();
            let mut l = ne;
            for r in (ne + 1)..=nsym {
                let mut delta = 0u8;
                for i in 0..=l.min(lambda.len() - 1) {
                    if r > i {
                        delta ^= gf_mul(lambda[i], s[r - 1 - i]);
                    }
                }
                let mut xb = Vec::with_capacity(b.len() + 1);
                xb.push(0);
                xb.extend_from_slice(&b);
                if delta == 0 {
                    b = xb;
                    continue;
                }
                let len = lambda.len().max(xb.len());
                let mut t = vec![0u8; len];
                t[..lambda.len()].copy_from_slice(&lambda);
                for i in 0..xb.len() {
                    t[i] ^= gf_mul(delta, xb[i]);
                }
                if 2 * l < r + ne {
                    let inv = gf_inv(delta);
                    b = lambda.iter().map(|&c| gf_mul(c, inv)).collect();
                    l = r + ne - l;
                } else {
                    b = xb;
                }
                lambda = t;
            }
            while lambda.len() > 1 && *lambda.last().unwrap() == 0 {
                lambda.pop();
            }
            let deg = lambda.len() - 1;
            if deg != l || 2 * (l - ne.min(l)) + ne > nsym {
                return None;
            }
            let mut pos = Vec::new();
            for p in 0..n {
                let xinv = exp((255 - ((n - 1 - p) % 255)) % 255);
                if poly_eval(&lambda, xinv) == 0 {
                    pos.push(p);
                }
            }
            if pos.len() != deg {
                return None;
            }
            let mut omega = vec![0u8; nsym];
            for i in 0..lambda.len() {
                if lambda[i] == 0 {
                    continue;
                }
                for j in 0..(nsym - i.min(nsym)) {
                    omega[i + j] ^= gf_mul(lambda[i], s[j]);
                }
            }
            let mut dl = vec![0u8; lambda.len()];
            let mut i = 1;
            while i < lambda.len() {
                dl[i - 1] = lambda[i];
                i += 2;
            }
            for &p in &pos {
                let x = exp((n - 1 - p) % 255);
                let xinv = gf_inv(x);
                let num = poly_eval(&omega, xinv);
                let den = poly_eval(&dl, xinv);
                if den == 0 {
                    return None;
                }
                cw[p] ^= gf_mul(x, gf_mul(num, gf_inv(den)));
            }
            if syndromes(cw, nsym, &mut s) {
                return None;
            }
            Some(pos.len())
        }
    }

    fn rng(seed: &mut u64) -> u32 {
        *seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (*seed >> 33) as u32
    }

    /// Same parity and, for every damage pattern (correctable or not, with and without
    /// erasures, right and wrong ones), the same verdict and the same bytes as the reference.
    #[test]
    fn same_results_as_the_reference_decoder() {
        let mut seed = 0x5eed_1234_u64;
        let mut cases = 0;
        for &(n, nsym) in &[(255usize, 40usize), (255, 26), (255, 56), (255, 76), (120, 20), (60, 12), (24, 2), (30, 6), (255, 2), (255, 254), (40, 39)] {
            for round in 0..400 {
                let k = n - nsym;
                let msg: Vec<u8> = (0..k).map(|_| rng(&mut seed) as u8).collect();
                let cw = encode(&msg, nsym);
                assert_eq!(cw, reference::encode(&msg, nsym), "parity n={n} nsym={nsym}");
                // damage: from nothing to well past the capacity
                let errors = match round % 8 {
                    0 => 0,
                    1 => 1,
                    2 => nsym / 2,
                    3 => nsym / 2 + 1,
                    4 => rng(&mut seed) as usize % (nsym + 1),
                    5 => n / 2,
                    6 => rng(&mut seed) as usize % (nsym / 2 + 1),
                    _ => rng(&mut seed) as usize % n,
                };
                let mut bad = cw.clone();
                let mut hit = Vec::new();
                for _ in 0..errors {
                    let p = rng(&mut seed) as usize % n;
                    bad[p] ^= (rng(&mut seed) % 255 + 1) as u8;
                    hit.push(p);
                }
                // erasures: none, some of the damaged positions, some wrong ones
                let mut erasures: Vec<usize> = Vec::new();
                match round % 5 {
                    1 => erasures.extend(hit.iter().take(nsym / 4)),
                    2 => erasures.extend((0..nsym / 2).map(|_| rng(&mut seed) as usize % n)),
                    3 => erasures.extend(hit.iter().take(nsym)),
                    4 => erasures.extend((0..nsym + 3).map(|_| rng(&mut seed) as usize % n)),
                    _ => {}
                }
                erasures.sort();
                erasures.dedup();
                let (mut a, mut b) = (bad.clone(), bad.clone());
                let ra = decode(&mut a, nsym, &erasures);
                let rb = reference::decode(&mut b, nsym, &erasures);
                assert_eq!(ra, rb, "verdict n={n} nsym={nsym} errors={errors} erasures={}", erasures.len());
                if ra.is_some() {
                    assert_eq!(a, b, "bytes n={n} nsym={nsym} errors={errors}");
                }
                cases += 1;
            }
        }
        assert!(cases > 4000);
    }
}
