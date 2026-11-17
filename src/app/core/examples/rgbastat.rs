//! Scans raw RGBA frames (as a browser's canvas gives them: `<file> <width> <height>` per
//! line of a list, see the website's dev hook `?grab=<n>`) with the exact scanner, whole and
//! without a skip map: per frame the header and the codewords that decode, over the run the
//! distinct packets.
//!
//!     cargo run --release --example rgbastat -- <list file>
use lumen::scan::{Image, Scanner};
use std::collections::HashSet;

fn main() {
    let list = std::env::args().nth(1).expect("a list of frames");
    let camera = std::env::var("CAMERA").is_ok();
    let mut sc = Scanner::new();
    let mut all: HashSet<Vec<u8>> = HashSet::new();
    let (mut n, mut per_frame, mut count) = (0usize, Vec::new(), 0usize);
    for line in std::fs::read_to_string(&list).expect("list").lines() {
        let f: Vec<&str> = line.split_whitespace().collect();
        if f.len() < 3 {
            continue;
        }
        let (w, h): (usize, usize) = (f[1].parse().unwrap(), f[2].parse().unwrap());
        let Ok(rgba) = std::fs::read(f[0]) else { continue };
        if rgba.len() < w * h * 4 {
            continue;
        }
        let t = std::time::Instant::now();
        let img = Image { width: w, height: h, rgba: &rgba };
        let res = if camera { sc.scan_rgba_camera(&img, None, None) } else { sc.scan(&img, None) };
        let ms = t.elapsed().as_secs_f64() * 1000.0;
        let ok = res.codewords.iter().filter(|c| c.ok).count();
        let mut fresh = 0;
        for c in &res.codewords {
            if let (true, Some(b)) = (c.ok, &c.bytes) {
                fresh += all.insert(b.clone()) as usize;
            }
        }
        if let Some(st) = &res.stats {
            count = st.cw_count;
        }
        n += 1;
        per_frame.push(ok);
        println!(
            "  {n:>2} {ms:>5.1} ms seq {:>4} ok {ok:>3}/{count} fresh {fresh:>3} cell {:.2} {}",
            res.header.map_or("-".into(), |h| if h.seq == u32::MAX { "reuse".into() } else { h.seq.to_string() }),
            res.stats.as_ref().map_or(0.0, |s| s.cell_px),
            res.reason
        );
    }
    println!("{n} frames · codewords per frame {count} · decoded per frame mean {:.1} · distinct packets {}", per_frame.iter().sum::<usize>() as f64 / n.max(1) as f64, all.len());
}
