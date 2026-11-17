//! What a run of consecutive raw captures (frame-N.nv12 from the debug `grab`) holds: per
//! capture the frame it shows and the codewords that decode, and over the run the packets a
//! receiver could have got from it.
//!
//!     cargo run --release --example grabstat -- <dir>
//!
//! Every capture is scanned whole, without a skip map, so the numbers are what the captures
//! contain, not what the receive engine takes from them (`realframes` replays them through
//! the engine). V=1 prints a line per capture; ROUNDS=n repeats the run, for a profiler.
use lumen::scan::{Hint, Scanner, YuvImage};
use std::collections::{BTreeMap, HashSet};
use std::time::Instant;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let dir = &args[1];
    let verbose = std::env::var("V").is_ok();
    let mut sc = Scanner::new();
    let mut hint: Option<Hint> = None;
    let mut all: HashSet<Vec<u8>> = HashSet::new();
    // seq -> (codeword indices decoded, captures, total codewords)
    let mut by_seq: BTreeMap<u32, (HashSet<usize>, u32, usize)> = BTreeMap::new();
    let (mut n, mut ms_sum, mut found) = (0, 0.0, 0);
    let (mut best_single, mut count) = (0usize, 0usize);
    let mut per_capture = Vec::new();
    let rounds: usize = std::env::var("ROUNDS").ok().and_then(|v| v.parse().ok()).unwrap_or(1);
    let files: Vec<Vec<u8>> = (1..=400).map_while(|i| std::fs::read(format!("{dir}/frame-{i}.nv12")).ok()).collect();
    for i in 1..=files.len() * rounds {
        let d = &files[(i - 1) % files.len()];
        let u = |k: usize| u32::from_le_bytes(d[k * 4..k * 4 + 4].try_into().unwrap()) as usize;
        let (w, h, ys, uvs) = (u(0), u(1), u(2), u(3));
        let mut y = Vec::with_capacity(w * h);
        for r in 0..h {
            y.extend_from_slice(&d[16 + r * ys..16 + r * ys + w]);
        }
        let uv0 = 16 + ys * h;
        let mut cbcr = Vec::with_capacity(w * h / 2);
        for r in 0..h / 2 {
            cbcr.extend_from_slice(&d[uv0 + r * uvs..uv0 + r * uvs + w]);
        }
        let img = YuvImage { width: w, height: h, y: &y, cbcr: &cbcr };
        let t = Instant::now();
        let res = sc.scan_yuv(&img, None, hint);
        let ms = t.elapsed().as_secs_f64() * 1000.0;
        n += 1;
        ms_sum += ms;
        let ok: Vec<usize> = res.codewords.iter().filter(|c| c.ok).map(|c| c.index).collect();
        let mut fresh = 0;
        for c in &res.codewords {
            if let (true, Some(b)) = (c.ok, &c.bytes) {
                fresh += all.insert(b.clone()) as usize;
            }
        }
        if let Some(st) = &res.stats {
            hint = Some(Hint { corners: st.corners, module: st.cell_px });
            count = st.cw_count;
        }
        if res.ok {
            found += 1;
        }
        let seq = res.header.map(|h| h.seq);
        if let Some(s) = seq.filter(|&s| s != u32::MAX) {
            let e = by_seq.entry(s).or_insert((HashSet::new(), 0, count));
            e.0.extend(ok.iter().copied());
            e.1 += 1;
        }
        best_single = best_single.max(ok.len());
        per_capture.push(ok.len());
        if verbose {
            println!(
                "  {i:>3} {ms:>5.1} ms seq {:>4} ok {:>3}/{count} fresh {fresh:>3} cell {:.2} {}{}",
                seq.map_or("-".into(), |s| if s == u32::MAX { "reuse".into() } else { s.to_string() }),
                ok.len(),
                res.stats.as_ref().map_or(0.0, |s| s.cell_px),
                res.reason,
                if res.header_reused { " (header reused)" } else { "" }
            );
        }
    }
    if n == 0 {
        println!("{dir}: no frames");
        return;
    }
    // sender frames the run spans (first to last seq seen)
    let span = match (by_seq.keys().next(), by_seq.keys().next_back()) {
        (Some(a), Some(b)) => ((b + 256 - a) & 255) as usize + 1,
        _ => 0,
    };
    let union: usize = by_seq.values().map(|e| e.0.len()).sum();
    let mean = per_capture.iter().sum::<usize>() as f64 / n as f64;
    println!(
        "{dir}: {n} captures, {found} located, {:.1} ms/scan · grid cw {count} · span {span} sender frames · per capture mean {mean:.1} best {best_single} · distinct packets {} = {:.0}% of span · per-seq union {:.0}%",
        ms_sum / n as f64,
        all.len(),
        100.0 * all.len() as f64 / (span * count).max(1) as f64,
        100.0 * union as f64 / (span * count).max(1) as f64,
    );
}
