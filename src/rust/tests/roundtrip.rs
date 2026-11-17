// End-to-end in Rust: Sender -> Renderer -> simulated camera -> Scanner -> Receiver.
use lumen::scan::{apply_h, homography, Hint, Image, Scanner, YuvImage};
use lumen::transfer::{prepare, Finish, Receiver, Sender};
use lumen::util::Rng;
use lumen::Renderer;

/// Perspective warp of the rendered code into a camera frame, bilinear, plus a 3x3 blur.
fn camera(src: &[u32], sw: usize, sh: usize, cw: usize, ch: usize, quad: [[f64; 2]; 4]) -> Vec<u8> {
    let rect = [[0.0, 0.0], [sw as f64, 0.0], [sw as f64, sh as f64], [0.0, sh as f64]];
    let hinv = homography(&quad, &rect).unwrap();
    let mut out = vec![0u8; cw * ch * 4];
    for y in 0..ch {
        for x in 0..cw {
            let (u, v) = apply_h(&hinv, x as f64 + 0.5, y as f64 + 0.5);
            let o = (y * cw + x) * 4;
            let (px, py) = (u.floor() as i64, v.floor() as i64);
            let rgb = if px < 0 || py < 0 || px >= sw as i64 || py >= sh as i64 { [28u8, 28, 30] } else {
                let p = src[py as usize * sw + px as usize];
                [p as u8, (p >> 8) as u8, (p >> 16) as u8]
            };
            out[o..o + 3].copy_from_slice(&rgb);
            out[o + 3] = 255;
        }
    }
    let mut blurred = out.clone();
    for y in 1..ch - 1 {
        for x in 1..cw - 1 {
            for c in 0..3 {
                let mut s = 0u32;
                for (dx, dy, w) in [(0i64, 0i64, 4u32), (1, 0, 1), (-1, 0, 1), (0, 1, 1), (0, -1, 1)] {
                    s += out[(((y as i64 + dy) as usize) * cw + (x as i64 + dx) as usize) * 4 + c] as u32 * w;
                }
                blurred[(y * cw + x) * 4 + c] = (s / 8) as u8;
            }
        }
    }
    blurred
}

#[test]
fn rust_sender_to_rust_receiver() {
    let mut rng = Rng::new(42);
    let file: Vec<u8> = (0..60_000).map(|_| (rng.next() & 0xff) as u8).collect();
    let prepared = prepare(&file, "roundtrip.bin", true);
    let mut tx = Sender::new(&prepared, 1, 1, 90, 150, 0x0abc, 3).unwrap();
    let mut rx = Receiver::new();
    let mut sc = Scanner::new();
    let (cw, ch) = (1280usize, 720usize);
    for f in 0..80 {
        let frame = tx.next_frame();
        let r = Renderer::new(&tx.layout, tx.mode, 5, 2);
        let mut px = vec![0u32; r.width * r.height];
        r.draw(&frame.cells, &mut px);
        // place the code with some rotation and keystone
        let (w, h) = (r.width as f64 * 1.0, r.height as f64 * 1.0);
        let s = 640.0 / h;
        let (cx, cy) = (640.0, 360.0);
        let ang: f64 = 0.06 + 0.01 * (f % 3) as f64;
        let rot = |x: f64, y: f64| [cx + (x * ang.cos() - y * ang.sin()) * s, cy + (x * ang.sin() + y * ang.cos()) * s];
        let quad = [rot(-w / 2.0 * 0.96, -h / 2.0), rot(w / 2.0 * 0.96, -h / 2.0), rot(w / 2.0 * 1.04, h / 2.0), rot(-w / 2.0 * 1.04, h / 2.0)];
        let img = camera(&px, r.width, r.height, cw, ch, quad);
        let res = sc.scan(&Image { width: cw, height: ch, rgba: &img }, None);
        assert!(res.ok, "frame {f} not found: {}", res.reason);
        for c in &res.codewords {
            if let Some(b) = &c.bytes {
                rx.push(b);
            }
        }
        if let Some(Finish::File { name, bytes }) = rx.try_finish() {
            assert_eq!(name, "roundtrip.bin");
            assert_eq!(bytes, file);
            eprintln!("decoded after {} frames", f + 1);
            return;
        }
    }
    panic!("transfer did not complete");
}

/// The camera paths on the same simulated camera: an RGBA picture read cell by cell (what a
/// browser's canvas gives), and camera planes read both ways (smoothed whole as the apps do,
/// cell by cell as the WebAssembly build does). Each must bring the file through, with the
/// tracking hint of the last frame in use.
#[test]
fn camera_paths_bring_the_file_through() {
    let mut rng = Rng::new(7);
    let file: Vec<u8> = (0..40_000).map(|_| (rng.next() & 0xff) as u8).collect();
    let prepared = prepare(&file, "camera.bin", true);
    let (cw, ch) = (1280usize, 720usize);
    // full-range BT.601; chroma of each 2 × 2 block, level with its left column when `left`
    let planes = |rgba: &[u8], left: bool| -> (Vec<u8>, Vec<u8>) {
        let y: Vec<u8> = rgba.chunks_exact(4).map(|p| (0.299 * p[0] as f64 + 0.587 * p[1] as f64 + 0.114 * p[2] as f64).round() as u8).collect();
        let mut cbcr = vec![0u8; (cw / 2) * (ch / 2) * 2];
        for cy in 0..ch / 2 {
            for cx in 0..cw / 2 {
                let mut acc = [0f64; 3];
                let cols: &[usize] = if left { &[2 * cx] } else { &[2 * cx, 2 * cx + 1] };
                for &x in cols {
                    for yy in [2 * cy, 2 * cy + 1] {
                        for c in 0..3 {
                            acc[c] += rgba[(yy * cw + x) * 4 + c] as f64 / (cols.len() * 2) as f64;
                        }
                    }
                }
                let k = (cy * (cw / 2) + cx) * 2;
                cbcr[k] = (128.0 - 0.168_736 * acc[0] - 0.331_264 * acc[1] + 0.5 * acc[2]).round().clamp(0.0, 255.0) as u8;
                cbcr[k + 1] = (128.0 + 0.5 * acc[0] - 0.418_688 * acc[1] - 0.081_312 * acc[2]).round().clamp(0.0, 255.0) as u8;
            }
        }
        (y, cbcr)
    };
    for path in ["rgba", "planes", "planes, cell by cell", "planes with chroma on the even columns, cell by cell"] {
        let mut tx = Sender::new(&prepared, 2, 1, 150, 90, 0x0abc, 3).unwrap();
        let mut rx = Receiver::new();
        let mut sc = Scanner::new();
        sc.set_lean(path.ends_with("cell by cell"));
        sc.set_chroma_left(path.contains("even columns"));
        let mut hint = None;
        let mut done = false;
        for f in 0..80 {
            let frame = tx.next_frame();
            let r = Renderer::new(&tx.layout, tx.mode, 5, 2);
            let mut px = vec![0u32; r.width * r.height];
            r.draw(&frame.cells, &mut px);
            let (w, h) = (r.width as f64, r.height as f64);
            let s = 1100.0 / w;
            let (cx, cy) = (640.0 + (f % 4) as f64, 360.0);
            let ang: f64 = 0.03 + 0.005 * (f % 3) as f64;
            let rot = |x: f64, y: f64| [cx + (x * ang.cos() - y * ang.sin()) * s, cy + (x * ang.sin() + y * ang.cos()) * s];
            let quad = [rot(-w / 2.0 * 0.97, -h / 2.0), rot(w / 2.0 * 0.97, -h / 2.0), rot(w / 2.0 * 1.03, h / 2.0), rot(-w / 2.0 * 1.03, h / 2.0)];
            let img = camera(&px, r.width, r.height, cw, ch, quad);
            let res = if path == "rgba" {
                sc.scan_rgba_camera(&Image { width: cw, height: ch, rgba: &img }, None, hint)
            } else {
                let (y, cbcr) = planes(&img, path.contains("even columns"));
                sc.scan_yuv(&YuvImage { width: cw, height: ch, y: &y, cbcr: &cbcr }, None, hint)
            };
            assert!(res.ok, "{path}: frame {f} not found: {}", res.reason);
            let st = res.stats.as_ref().unwrap();
            assert!(4 * st.cw_ok >= 3 * st.cw_count, "{path}: frame {f} decoded {} of {}", st.cw_ok, st.cw_count);
            hint = Some(Hint { corners: st.corners, module: st.cell_px });
            for c in &res.codewords {
                if let Some(b) = &c.bytes {
                    rx.push(b);
                }
            }
            if let Some(Finish::File { bytes, .. }) = rx.try_finish() {
                assert_eq!(bytes, file, "{path}");
                eprintln!("{path}: decoded after {} frames", f + 1);
                done = true;
                break;
            }
        }
        assert!(done, "{path}: transfer did not complete");
    }
}

/// Frames produced by the JS camera simulator (test/make-raw.js), when present.
#[test]
fn decode_js_simulated_frames() {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../test/out/raw");
    let Ok(entries) = std::fs::read_dir(dir) else {
        eprintln!("no JS fixtures (run: node test/make-raw.js)");
        return;
    };
    let mut sc = Scanner::new();
    let mut n = 0;
    for e in entries.flatten() {
        let p = e.path();
        if p.extension().and_then(|x| x.to_str()) != Some("rgba") {
            continue;
        }
        let data = std::fs::read(&p).unwrap();
        let w = u32::from_le_bytes(data[0..4].try_into().unwrap()) as usize;
        let h = u32::from_le_bytes(data[4..8].try_into().unwrap()) as usize;
        let want = u32::from_le_bytes(data[8..12].try_into().unwrap()) as usize;
        let t0 = std::time::Instant::now();
        let res = sc.scan(&Image { width: w, height: h, rgba: &data[12..] }, None);
        let ms = t0.elapsed().as_secs_f64() * 1000.0;
        let ok = res.codewords.iter().filter(|c| c.ok).count();
        eprintln!("{}: ok={} {}/{} (JS decoded {}) {:.1} ms", p.file_name().unwrap().to_string_lossy(), res.ok, ok, res.codewords.len(), want, ms);
        assert!(res.ok);
        assert!(ok + 1 >= want, "Rust decoded {ok}, JS decoded {want}");
        n += 1;
    }
    eprintln!("{n} JS fixtures checked");
}
