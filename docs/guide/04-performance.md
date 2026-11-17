# 4 · Performance: where the speed comes from

[Guide index](README.md) · [中文](04-performance.zh-CN.md)

## 4.1 One formula

```
actual speed = FPS × codewords per frame × payload per codeword T
               └───────── set by the sender: raw rate ──────────┘
             × capture rate × codeword success rate
               └────── set by the receiver ───────┘
             ÷ (1 + fountain overhead)
               └──────── ≈ 0 ────────┘
```

- **Raw rate**: the "Raw rate" shown by the demo sender. It assumes every frame is received in full.
- **Capture rate**: the share of the sender's frames that the receiver captured and scanned ("captured" in the demo receiver's diagnostic line).
- **Codeword success rate**: the share of codewords decoded from the captured frames ("Success").
- **Fountain overhead**: recovering K source symbols takes on average K + 1.6 symbols (K + 2.4 for the largest blocks; specification Appendix C.2), which is negligible for large files.

Every speed-up technique raises one of these terms.

## 4.2 Real-device results

These device-test results were reported by the maintainer on 2026-11-03. They are not theoretical rates calculated from frame capacity, and no other animated-code protocol was benchmarked under matching conditions.

| Sending device | Receiving device | Speed reached in testing |
|---|---|---|
| Computer | iPhone app | About 0.5 MB/s |
| Android app | iPhone app | About 100 KB/s |

Measured again on 2026-11-17 on the same devices, after the receiver began to scan every camera frame, to limit the exposure time and to keep its rate when warm:

| Sender settings (60 FPS, medium ECC) | Raw rate | Receive rate | Codewords decoded | Camera pixels per cell |
|---|---|---|---|---|
| Density High, 4 colours | 849 KB/s | 844 KB/s | 99% | 4.3 |
| Density Max, 4 colours | 1.3 MB/s | 1.23 MB/s | 90–94% | 3.5 |
| Density Max, 4 colours, low ECC | 1.4 MB/s | 1.29 MB/s | 86–89% | 3.5 |
| Density High, 8 colours | 1.2 MB/s | 1.09–1.2 MB/s | 82–94% | 4.0–4.3 |
| Density Max, 8 colours | 2.0 MB/s | 0.3–0.5 MB/s | 20–24% | 3.4 |

Conditions: the desktop app played full screen on a 27-inch 4K 60 Hz LCD monitor; the iPhone 15 Pro app received hand-held at 1080p, 120 captures a second, exposure limited to 1/1000 s; the file was random data (not compressible); each figure is the receive rate shown by the panel over a steady stretch of about 20 seconds. Under the same conditions, density High gave 470–730 KB/s before the changes. One complete transfer (95.4 MB, default settings, that is Max with 4 colours) took 127.7 s, 765 KB/s over the whole file, of which about 20 s went to aiming and the phone moved once on the way; the steady stretches ran at 1.0–1.1 MB/s (3.2–3.4 pixels per cell).

These are speeds reached in testing, not sustained averages guaranteed on every device. Higher playback frame rates can increase transfer speed when the devices have enough capacity; results also depend on the display, camera, distance and lighting.

Full device models, software versions, playback frame rates, file sizes, compression settings, timing definitions and repeated-run logs have not been recorded alongside these two results. They cannot establish a speed multiple over another protocol. Future measurements should record those conditions and distinguish the live receive rate from the completed file's average rate, especially when compression changes the relationship between original-file throughput and link throughput.

## 4.3 Seven sources

### ① More bits per cell (× 2 or × 3)

A QR module is black or white: 1 bit. Lumen Code uses colour: 2 bits per cell with C4, 3 with C8. The three bits of C8 map directly to the R, G and B channels, so one misjudged channel costs only 1 bit.

C8 is not the default because the more colours there are, the closer adjacent colours look to the camera, and the more sensitive they are to blur, moiré and white balance. In the simulated "hand-held, not aimed" test, the codeword success rate is about 86–89% for C4 and about 60% for C8. C4 × 0.88 = 1.76 bits/cell is only slightly less than C8 × 0.6 = 1.8 bits/cell, and much more stable.

### ② More cells (shape follows the screen, size follows the physical dimensions)

- **Shape**: QR is square, but phone screens and camera images are rectangles, and a square covers at most 56% of a 16:9 area. A Lumen Code grid can be any X × Y. The reference sender fills the screen (aspect ratio ≤ 2.4); on an upright phone this gives a tall, narrow code with about 25% more cells than a 16:9 limit would allow.
- **Size**: the number of QR modules is set by the version, independent of the screen. Lumen Code chooses the cell size from the **physical size** of the screen, about 0.75 mm per cell, which is close to what a 1080p camera can resolve at a normal distance. A laptop screen therefore fits 36 000 cells, 2.65 times as many as QR v25.

### ③ Low structural overhead

In full-size frames, data cells make up 92.6% (phone) to 95.3% (laptop) of the grid. After subtracting the RS check bytes (16%), the 7-byte header and trailer of each packet, and filler, the **file payload is 75–77% of all cell bits**.

### ④ ECC designed for the screen-to-camera channel

- Each codeword has its own RS (n ≤ 255) ECC, at level 10% / 16% / 22% / 30%.
- The receiver uses the confidence of the colour classification to find the most suspect bytes and retries with them as erasures, which brings "soft information" into RS decoding.
- Every packet has a CRC-16, so aggressive erasure retries are safe: wrong data cannot get into the fountain decoder.

### ⑤ Independent codewords + Hilbert layout: half a frame is still useful

A QR frame either decodes completely or is lost. A Lumen Code frame has a dozen to several dozen independent codewords, each occupying a compact area along the Hilbert curve. A torn frame (the camera captures half of the old frame and half of the new one), a patch of glare or an out-of-focus corner loses only the codewords in that area (see the codeword map in [guide 1](01-how-it-works.md)). Such partly usable frames are a large share of real captures.

### ⑥ Fountain code: every frame is new data

With looped playback the receiver must collect every fragment, and each missed one costs a whole pass. With a frame loss rate p and N frames per pass, the average number of passes needed (equal to the time factor) is:

| File frames N | 10% lost | 20% lost | 30% lost |
|---|---|---|---|
| 10 | 1.76 | 2.32 | 2.93 |
| 46 | 2.41 | 3.25 | 4.17 |
| 150 | 2.93 | 3.97 | 5.14 |

A fountain code only needs enough distinct symbols, so its time factor is about 1 / (1 − p): 1.25 at 20% loss, whatever the file size. The advantage grows with file size and loss rate; across the table above it is 1.5 to 3.6 times.

The receiver can also start scanning at any time, and moving away and aiming again loses no data already received. The file descriptor repeats every 4 frames, so the file name is available at any time.

### ⑦ Compression

Text, JSON, logs and source code are compressed with DEFLATE before sending, usually to 1/3–1/5 of their size, which multiplies the speed by 3–5. The "Average speed" that the demo receiver shows on completion is computed from the original file size, so for text it is clearly higher than the "Receive rate".

## 4.4 Compute side: helping the receiver keep up

The protocol sets the upper limit on speed; the receiver's compute speed decides how much of it is actually received. If scanning a frame takes 45 ms while the camera delivers a frame every 33 ms and the sender changes frames every 83 ms, the receiver misses frames and heats up. The reference implementation does the following:

| Technique | Effect |
|---|---|
| Every camera frame is scanned while a code is in view | A screen changes frames row by row from top to bottom, and an LCD needs some milliseconds to settle, so at 60 FPS any one capture is clean over about half its area; the clean areas of two captures in a row complement each other and together come close to 100% |
| A frame that is already decoded: read only the header | About 1 ms, against 5–9 ms for a full scan |
| The first two captures of a frame are read whole; later ones decode only the remaining codewords | A capture can carry a new header over cells of the frame before; a codeword place that gives the packet it gave last shows the old frame, and is not booked to the new one |
| Exposure of at most 1/16 of the sender's frame period (1/1000 s at 60 FPS) | A capture whose shutter is open across a frame change holds a blend of two frames; 1/1000 s decodes about a seventh more of each capture than 1/500 s, and shorter still (1/2000, 1/4000) loses to noise |
| RS decoding from tables, with the remainder by the generator polynomial as the test for a clean codeword | Byte-for-byte the results of the earlier decoder; RS time in one scan fell from 7.2 ms to 0.7 ms |
| Camera path: luma smoothed to the cell size and read once per cell; the classifier starts from the last capture's colours and gains; alignment points are looked for where they were | One scan fell from 18.2 ms to 4.7 ms (M2, a 377×198 code), and 8 colours decode about 16% more |
| A warm phone (fair, serious) keeps its rate; only at the critical level are scans cut and the camera held at 60 FPS | A transfer lasts a minute or two, and scanning less is the loss the person wants to avoid |
| ROI + adaptive resolution (scaled to about 6 pixels per cell) | About 1/3 of the pixels, scanning about 2 times faster, same decode rate |
| ROI crop and scaling done by the GPU (the crop and resize options of `createImageBitmap`) | No copy and read-back of the full 1080p frame; preparing a scan takes about 3 ms |
| Camera off after completion; fewer scans with no code in view; camera at 30 FPS unless the sender plays fast | Almost no power used while reading the result or with the phone put down |
| No background blur over the video | Saves one full-screen GPU blur per camera frame |
| Rust → WebAssembly | 2.1–2.3 times faster than JS |
| Parallel Workers | 2 on phones, up to 3 on computers |
| GPU compositing on the sender (a canvas with 1 pixel per cell + a static mask, scaled up by the GPU) | The sender's CPU cost per frame is close to zero |

On an Apple M2, a full scan of a 1080p photo takes 15–16 ms in JS and 7 ms in WASM for a phone-size code, and 33 ms in JS and 14 ms in WASM for a laptop-size code. The native apps' camera path (Y'CbCr; it need not match the JS scanner bit for bit) scans a 377×198 code in 4.7 ms and a 473×248 code in 7 ms; on an iPhone 15 Pro, about 5 ms and 9 ms.

## 4.5 What actually limits the speed

In order of impact:

1. **Pixels per cell in the camera image.** Measured with the native app (60 FPS, 4 colours): 99% of codewords at 4 pixels and more, 90–94% at 3.5, 80–86% at 3.2–3.4, and below half soon under 3.0. In a 1080p image, density Max gives at most 4.0 pixels per cell (when the code exactly fills the frame), so it needs the code to fill most of the picture. It depends on the cell size on the screen, the capture distance and the camera resolution. A higher "Density" puts more data in each frame, but the cells get smaller and the success rate drops.
2. **Camera**: the best sender rate is half the camera's fastest unbinned rate, so that every frame is captured twice. Measured from a MacBook's built-in 120 Hz screen to an iPhone 15 Pro (camera at 120 FPS): 766 KB/s with the sender at 60 FPS and only 80–400 KB/s at 120 FPS, where each frame is captured once and mostly inside the frame change. The 240 FPS mode of this phone is binned only: it smears the colour over neighbouring cells and no codeword decodes. Most phone web pages get only 30 FPS; the rolling shutter causes tearing; motion blur.
3. **Display**: the top frame rate is the screen's refresh rate (the apps offer up to the rate they measure; no figure is fixed, and the protocol's own limit is 240 FPS because the frame number has 8 bits). On a 60 Hz screen the FPS should be a divisor of 60; otherwise the time each frame stays on screen varies. An LCD takes some milliseconds over each frame change, which the receiver covers with two captures per frame.
4. **Receiver compute power**: if "captured" in the diagnostic line is below 80% and the engine time is high, compute power is the limit. Switch to WASM or lower the scan resolution.

Tuning order: first secure the success rate (≥ 4.5 pixels per cell, success rate ≥ 90%), then raise the FPS, and only then consider a higher density or C8. When there is headroom, the receiver shows "Spare capacity: you can raise the sender FPS to about N".

### Where the web receiver falls behind the app (Safari, measured 2026-11-17)

Safari on an iPhone 15 Pro, a code on a 60 Hz monitor (420 × 201 cells, 8 colours, 121 codewords a frame, about 4.2 pixels a cell in the capture):

| | Canvas + exact path (before) | Camera planes + camera path (now) |
|---|---|---|
| Getting a frame | 20 ms (drawn to a canvas, read back) | 0.5 ms (`VideoFrame.copyTo`) |
| One scan | 65–90 ms | 12–13 ms |
| Scans a second | about 15 (half of the camera's 30 dropped) | 30 |
| Sender at 30 FPS | about 100 KB/s, 30–35% decoded | 248 KB/s on average, 385 at best, 42% decoded |
| Sender at 20 FPS | — | 399 KB/s on average, 484 at best, 80% decoded |

The app on the same phone receives about 1 MB/s from the same screen (sender at 60 FPS, reported by the maintainer). What is left of the difference comes from the camera the browser gives:

- **Only 30 FPS are usable.** Safari states a top rate of 60 FPS, but offers it at 720p only, and that mode is binned, overexposed and sharpened: every frame is located and no codeword decodes. 1080p stays at 30 FPS; the app uses 120. The web receiver keeps a faster mode only if it has at least 1080 lines and still decodes.
- **No exposure control.** Safari's camera capabilities hold no exposure setting. A capture whose exposure spans a frame change is a blend of two frames and does not decode. With sender and camera both at 30 FPS, several captures in a row are clean and then several are almost wholly lost (the phase between the two clocks drifts slowly): under half decodes on average.
- **So the sender has to be slower than the camera**: a frame must stay up for one capture period plus the time a frame change smears a capture, and is then captured clean at least once. For a camera at 30 FPS that is 20 FPS (table above), for a camera at 120 it is 60. The receiver advises the slower rate when the sender is faster and what decodes on average is less than the slower rate would bring; an OLED phone sending at 30 FPS decodes 68% on average, 20 brings nothing there, and nothing is advised.
- **Cells need about 4 pixels**: at 3.5–3.8 pixels 0–3% decodes, at 4.1 pixels 45%. A 1080p capture is 1920 pixels wide, so a code of 420 columns has to fill nine tenths of it; with smaller cells the receiver advises to move closer or lower the density.

How the web reads the picture now:

- Where the browser has WebCodecs, `new VideoFrame(video)` gives the camera's own Y'CbCr planes (NV12 in Safari). Only the part with the code is copied into the WASM module, which takes the camera path of the apps (`lm_scan_yuv`). Any format other than NV12 or I420 falls back to the canvas.
- In WASM the camera path reads cell by cell: the smoothing kernel is worked out at each cell's centre, and the luma plane is not filtered whole. Filtering the whole plane is cheap only with vector instructions, which WASM lacks by default, and iOS checks every memory access; together with the colour conversion it was two fifths of a scan.
- The four corners of the last scan go with the next frame, and the finders are looked for near them first.
- Chroma siting: Safari's NV12 has its chroma level with the even luma columns (as video has it). Read as centred, three tenths fewer codewords decode (24 against 34 on one frame). The apps' camera path reads it as centred for now; to be checked on device captures.

### Chrome on Android (measured 2026-11-17)

Chrome 157 on a Galaxy S22, the same 60 Hz monitor, 8 colours, sender at 20 FPS, 3.5–3.9 pixels a cell in the capture:

| | Average | Best | Decoded |
|---|---|---|---|
| The camera's own exposure (33 ms) | 0 | 0 | 0% |
| Exposure held at 2.5 ms by the page | 225 KB/s | 362 KB/s | 43% |
| and chroma read as centred | 295 KB/s | 376 KB/s | 59% |

- **Exposure.** Facing a screen in a room, the camera exposes for a whole frame period (33 ms on the S22, 30 ms on a Redmi K40): every capture is two frames blended, most headers cannot be read and no codeword decodes. Chrome on Android lets a page set the exposure: once a code has been located six times within a second (an unreadable header counts), the exposure is held at a sixteenth of the sender's frame (1–2.5 ms); the gain starts at ISO 800 and follows the brightness of the code's area; three seconds after the code has left the view the camera has its exposure back. WebKit is left out by name (`src/website/src/lib/recv/exposure.ts`): receiving on an iPhone was tuned without this, and should Safari offer it one day it is to be measured before it is used.
- **Chroma siting.** Chrome gives I420 with chroma centred on its four luma pixels; Safari's NV12 has it level with the even columns. Read the wrong way, three frames from the S22 decode 0, 3 and 3 codewords; read the right way 4, 16 and 18 (of 137).
- **Which camera.** The page asks the browser for the camera at the back, and on a phone with several Chrome does not always give the main one. On the S22 it gives the ultra-wide (fixed focus, a wider view): the code is small in the picture and the phone has to be held very close. The figures in the table were measured with it; they have not been measured again with the main camera. The page now picks the main camera by name: Chrome on Android calls its cameras "camera <n>, facing back / front", and the lowest number on each side is the main one (the S22: 0 is the main camera with autofocus, 2 the ultra-wide, 1 and 3 at the front). Other browsers name them otherwise and keep choosing themselves (Safari chooses the main camera). The flip button goes between the main camera at the back and the main one at the front, no longer round every lens; only cameras without a side (a desktop's) are taken in turn. Opening a camera straight after closing another fails (about half a second is needed on the S22); the page tries again.
- **1080p only.** Chrome on both phones opens the camera at 1920 × 1080 and at no larger size it lists. A code with very many columns still has to fill the picture to get 4 pixels a cell; only a lower density at the sender changes that.
- **Zoom does not help.** The interface is there and the luma detail is real, but the cropped picture lacks colour resolution: at 2× zoom, cells of 3.8 pixels decode 2, 0 and 3 codewords, where cells of 3.07 pixels decode 4, 16 and 18 without zoom.
- **A Redmi K40 needs larger cells**: the chroma of its camera stream has about two fifths of the S22's amplitude, whatever the exposure (the camera's own, held short, bright, dark). With cells of 3.5–4 pixels nothing decodes, at 5.4 pixels 1%, at 7 pixels (density Low at the sender) half on average and 90% at best, 78 KB/s on average. When a code fills the picture, its frames are captured and next to nothing decodes, the receiver advises a lower density at the sender.

## 4.6 Measured cost of each stage

Method: `node test/bench.js` (JavaScript, Node 22) and `cargo run --release --example measure -- bench` in `src/rust` (Rust, native). Each value is the mean of many repetitions after one warm-up run. Machine: Apple M2 Pro, macOS 26.5. T = 200 bytes; RS(255, 215) is the default codeword of a large grid.

| Stage | JavaScript | Rust |
|---|---|---|
| RS encode, one codeword | 12.8 µs | 8.0 µs |
| RS decode, clean codeword | 33 µs | 33 µs |
| RS decode, 20 byte errors | 87 µs | 75 µs |
| Fountain: one encoding symbol | 1.2 µs | 0.12 µs |
| Fountain: decode K = 1000 from K + 10 symbols | 8.4 ms (24 MB/s) | 0.8 ms (250 MB/s) |
| Fountain: decode K = 16 384 from K + 10 symbols | 105 ms (31 MB/s) | 20 ms (164 MB/s) |
| Frame cells, 150 × 240 C4 (34 codewords) | 0.76 ms | 0.76 ms |
| Inflate (zlib stream of 2.2 MB of text) | 147 MB/s | — |
| Receiver, 2 MB transfer from packets (10 064 packets) | 168 ms (12 MB/s) | 25 ms (79 MB/s) |

The receiver's packet handling and decoding cost far less than scanning (§4.4): on a 100 KB/s camera link, everything after the scanner uses about 1 % of one core.

## 4.7 Can it go faster? Roadmap

The improvements are grouped by whether the protocol must change. Those that do not can be made at any time and stay compatible with all existing implementations.

### A. Receiver only (no protocol change)

| Improvement | How it works | Expected gain | Difficulty |
|---|---|---|---|
| **Cross-frame soft combining** | The same frame is usually captured 2–3 times, and today each capture is decoded independently. Instead, add up the colour likelihoods of the same cell across captures before classifying. A codeword that neither capture decodes alone may decode when they are combined | A clear success-rate gain in marginal conditions (3.4–4.5 pixels per cell), roughly worth one more density step | Medium |
| **Deblurring / crosstalk equalisation** | Blur mixes the colours of neighbours into each cell. Apply one equalisation pass with the measured blur kernel (subtract the weighted contribution of the neighbours from each cell) | **Tried, not adopted**: on phone captures at 3.5 pixels per cell the fitted crosstalk is close to zero (centre 1.03, neighbours under 0.02); equalising decoded 2% more for 30% more time | — |
| **Taking the transition out** | At 60 FPS about 45% of each capture lies in the change between two frames. With the frame before known, its share can be subtracted and the whole frame decoded from one capture | **Not now**, see below | High |
| **GPU or SIMD scanning** | Sampling and classification are highly parallel | **Not now**, see below | High |

### B. Sender only (no protocol change)

| Improvement | How it works | Expected gain |
|---|---|---|
| FPS aligned to the refresh rate | On a 120 Hz screen, use 20, 24 or 30 FPS so that each frame stays on screen for a constant time | Less tearing; higher FPS becomes usable |
| Tuning by the receiver's tips | There is no return channel, but a person can read the receiver's tips and adjust FPS and density | Already implemented (the tip "you can raise the sender FPS to about N") |

### C. Protocol changes (not in 1.0; left for a later version)

| Improvement | How it works | Cost | Recommendation |
|---|---|---|---|
| Header ECC | A BCH or short RS code on the header | 21–35 more cells per copy; the frame format changes | **Not adopted**: measured, when a header cannot be read its best copy usually has 15–30 wrong bits (it was sampled in the wrong place), so an ECC would recover only about 1/4 of them. Instead the receiver reuses the last correct header (implemented, no protocol change), which in the same test captured the full gain of a perfect header ECC (+3.7 points of C4 codeword success) |
| LDPC / soft-decision codes instead of RS | Use the colour confidence of each cell directly; coding gain about 1.5–2 dB | High decoding complexity; hard to implement | Leave for v2 |
| More colours (C16) | 4 bits per cell | Cameras cannot tell the colours apart well enough; the success rate would drop sharply | Not recommended |

### Two things decided against for now (2026-11-17)

**GPU or SIMD scanning.** Measurements show that computing does not limit the rate: one scan takes 4–10 ms on an iPhone 15 Pro, all 120 captures a second are scanned, and the rate is held by the camera's frame rate and the screen's frame change. Faster scanning would not bring one more packet. Sampling, classification and luma smoothing are about two thirds of a scan and parallel, so what they offer is less heat, not more rate. Do it when one of these happens, and SIMD first (it stays in the one Rust code base and every platform gains), the GPU after it (one implementation per platform, a delay for reading results back, and a GPU makes heat of its own):

- the receive panel shows fewer scans than camera frames, or "captured" under 100% with a normal success rate;
- a phone offers 240 FPS unbinned or 4K at 120 FPS, which is 2–8 times the scanning work of today;
- a warm phone needs more than about 25 ms per scan (the limit of three scan threads at 120 captures a second). Measured warm at density Max: 17–19 ms.

**Subtracting the frame change.** There are no figures for the gain, and four risks: the blend is not linear (an LCD rises and falls at different speeds, depending on the two colours, and the camera's output is not linear either), so where the model does not fit a screen the work is wasted; an area the frame before did not decode cannot be subtracted, so a missed frame carries on in the same area for some frames; one more RS attempt on near-random data is one more chance of a miscorrection that passes CRC-16, and when the file check stops it the whole transfer starts again; a scan would take an estimated 30–50% longer. If it is done: first check it offline on fresh raw captures at 60 and 120 FPS, and use it only as a second attempt on codewords that failed, so that the worst case is wasted work and never fewer packets.

Of the other receiver-only improvements, cross-frame soft combining is still worth doing: no protocol change, and a direct gain in success rate. The header format stays as it is and is frozen in 1.0.
