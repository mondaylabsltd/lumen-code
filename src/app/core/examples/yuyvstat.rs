//! What raw YUYV camera frames hold (a desktop webcam: `ffmpeg -f avfoundation -pixel_format
//! yuyv422 … -frames:v 45 -f rawvideo file`), read as the desktop app reads them: through the
//! engine's conversion to planes, then the scanner's camera path.
//!
//!     cargo run --release --example yuyvstat -- <file> <width> <height>
//!
//! LEFT=1 reads the chroma as level with the even luma columns (what YUYV is); LEAN=1 reads
//! cell by cell. Every frame is scanned whole, without a skip map.
use lumen::scan::{Hint, Scanner, YuvImage};
use lumen_app::engine::image::{prepare_yuv, Crop};
use lumen_app::{FrameRef, PixelFormat, Plane};

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let (w, h): (usize, usize) = (a[2].parse().unwrap(), a[3].parse().unwrap());
    let data = std::fs::read(&a[1]).expect("frames");
    let mut sc = Scanner::new();
    sc.set_chroma_left(std::env::var("LEFT").is_ok());
    if std::env::var("LEAN").is_ok() {
        sc.set_lean(true);
    }
    let (mut y, mut c) = (Vec::new(), Vec::new());
    let mut hint: Option<Hint> = None;
    let (mut total, mut count, mut n, mut ms) = (0usize, 0usize, 0usize, 0.0);
    let mut line = String::new();
    let mut cell = 0.0;
    let mut grid = String::new();
    for f in data.chunks_exact(w * h * 2) {
        let frame = FrameRef { width: w, height: h, format: PixelFormat::Yuyv, planes: [Plane { data: f, row_stride: w * 2, pixel_stride: 2 }, Plane::EMPTY, Plane::EMPTY], rotation: 0 };
        let Some((dw, dh)) = prepare_yuv(&frame, &Crop::full(w, h), &mut y, &mut c) else { continue };
        let t = std::time::Instant::now();
        let res = sc.scan_yuv(&YuvImage { width: dw, height: dh, y: &y, cbcr: &c }, None, hint);
        ms += t.elapsed().as_secs_f64() * 1000.0;
        n += 1;
        let ok = res.codewords.iter().filter(|c| c.ok).count();
        if let Some(st) = &res.stats {
            hint = Some(Hint { corners: st.corners, module: st.cell_px });
            count = st.cw_count;
            cell = st.cell_px;
            if let Some(hd) = res.header {
                grid = format!("{} x {} cells, {} colours", hd.x, hd.y, [2, 4, 8][hd.mode.min(2) as usize]);
            }
            line += &format!("{ok} ");
        } else {
            hint = None;
            line += "- ";
        }
        total += ok;
    }
    println!("{line}");
    println!("{n} frames · {grid} · {count} codewords a frame · cells of {cell:.1} pixels · decoded {total} in all, {:.1} a frame · {:.1} ms a scan", total as f64 / n.max(1) as f64, ms / n.max(1) as f64);
}
