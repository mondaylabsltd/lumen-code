// Rust/WebAssembly engine (src/rust compiled to dist/wasm/lumen.wasm). The module has no imports;
// this file wraps its C ABI in classes with the same shape as the JS Scanner / Sender /
// Receiver, so the app can switch engines freely.

import { makeLayout, codewordsPerFrame } from './layout.js?v=a9912f91f0';

let X = null; // wasm exports

// `src`: URL of lumen.wasm, or its bytes (e.g. in Node).
/** @param {URL | string | BufferSource} [src] */
export async function loadWasm(src = new URL(/* @vite-ignore */ '../../wasm/lumen.wasm', import.meta.url)) {
  if (X) return X;
  const bytes = src instanceof ArrayBuffer || ArrayBuffer.isView(src) ? src : await (await fetch(src)).arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  X = instance.exports;
  return X;
}

export function wasmReady() {
  return !!X;
}

const u8 = () => new Uint8Array(X.memory.buffer);
const view = () => new DataView(X.memory.buffer);
const REASONS = ['', 'finders', 'geometry', 'header', 'homography', 'image', 'layout'];

class Buf {
  constructor() {
    this.ptr = 0;
    this.cap = 0;
  }
  get(n) {
    if (n > this.cap) {
      if (this.ptr) X.lm_free(this.ptr, this.cap);
      this.cap = Math.ceil(n * 1.25);
      this.ptr = X.lm_alloc(this.cap);
    }
    return this.ptr;
  }
  free() {
    if (this.ptr) X.lm_free(this.ptr, this.cap);
    this.ptr = 0;
    this.cap = 0;
  }
}

export class WasmScanner {
  constructor() {
    this.h = X.lm_scanner_new();
    this.img = new Buf();
    this.skip = new Buf();
    this.hint = new Buf();
  }

  // img: { width, height, data } (RGBA), or a camera frame in its own planes:
  // { width, height, planes: { data, format: 'NV12' | 'I420', layout, crop, chroma } }, with
  // layout as VideoFrame.copyTo() returns it ([{ offset, stride }, …]) and crop = { x, y, w, h }
  // (even numbers) the part of the frame to scan; width and height are then the crop's.
  // chroma: 'left' when the chroma samples lie level with the even luma columns (Safari's
  // frames); otherwise they are taken as centred on their four luma pixels (Chrome's on Android).
  scan(img, opts = {}) {
    const { width: w, height: h } = img;
    let p;
    let cp = 0;
    if (img.planes) {
      // luma rows, then the chroma rows as interleaved Cb, Cr pairs
      const { data, format, layout, crop } = img.planes;
      const [cw, ch] = [(w + 1) >> 1, (h + 1) >> 1];
      p = this.img.get(w * h + cw * ch * 2);
      cp = p + w * h;
      const m = u8();
      const [Y, U, V] = layout;
      for (let r = 0; r < h; r++) {
        const from = Y.offset + (crop.y + r) * Y.stride + crop.x;
        m.set(data.subarray(from, from + w), p + r * w);
      }
      const [cx, cy] = [crop.x >> 1, crop.y >> 1];
      if (format === 'NV12')
        for (let r = 0; r < ch; r++) {
          const from = U.offset + (cy + r) * U.stride + cx * 2;
          m.set(data.subarray(from, from + cw * 2), cp + r * cw * 2);
        }
      else
        for (let r = 0; r < ch; r++) {
          let [fu, fv, to] = [U.offset + (cy + r) * U.stride + cx, V.offset + (cy + r) * V.stride + cx, cp + r * cw * 2];
          for (let c = 0; c < cw; c++) {
            m[to++] = data[fu++];
            m[to++] = data[fv++];
          }
        }
    } else {
      const { data } = img;
      const n = w * h * 4;
      p = this.img.get(n);
      u8().set(data.length === n ? data : data.subarray(0, n), p);
    }
    let sp = 0;
    let sl = 0;
    const keys = opts.skip ? Object.keys(opts.skip) : [];
    if (keys.length) {
      const words = [keys.length];
      for (const k of keys) {
        const idx = opts.skip[k];
        words.push(...k.split(':').map(Number), idx.length, ...idx);
      }
      sl = words.length;
      sp = this.skip.get(sl * 4);
      new Uint32Array(X.memory.buffer, sp, sl).set(words);
    }
    // opts.camera: the camera path, for live video. Faster, and the scanner keeps what it
    // learnt from the last frame (so one scanner per stream); its results need not match the
    // JavaScript scanner. Camera planes always take it. opts.hint = { corners, cellPx } of a
    // moment ago, in this image's pixels: the code is looked for there first.
    const camera = (opts.camera || img.planes) && X.lm_scan_camera;
    if (camera && opts.hint && X.lm_scanner_hint) {
      const hp = this.hint.get(64);
      new Float64Array(X.memory.buffer, hp, 8).set(opts.hint.corners.flat());
      X.lm_scanner_hint(this.h, hp, opts.hint.cellPx);
    }
    if (img.planes && X.lm_scanner_chroma) X.lm_scanner_chroma(this.h, img.planes.chroma === 'left' ? 1 : 0);
    const rp = img.planes ? X.lm_scan_yuv(this.h, p, cp, w, h, sp, sl) : camera ? X.lm_scan_camera(this.h, p, w, h, sp, sl) : X.lm_scan(this.h, p, w, h, sp, sl);
    const dv = view();
    let o = rp;
    const r32 = () => {
      const v = dv.getUint32(o, true);
      o += 4;
      return v;
    };
    const rf = () => {
      const v = dv.getFloat64(o, true);
      o += 8;
      return v;
    };
    const ok = !!r32();
    const skipped = !!r32();
    const reason = REASONS[r32()] || 'error';
    const candidates = r32();
    const [mode, Xg, Yg, nn, nsym, seq] = [r32(), r32(), r32(), r32(), r32(), r32()];
    const cellPx = rf();
    const corners = [];
    for (let i = 0; i < 4; i++) corners.push([rf(), rf()]);
    const markers = rf();
    const [cornerFound, cwOk, cwTotal, cwCount, corrected] = [r32(), r32(), r32(), r32(), r32()];
    const npk = r32();
    const k = r32();
    const codewords = [];
    for (let i = 0; i < npk; i++) {
      const index = r32();
      codewords.push({ index, ok: true, bytes: u8().slice(o, o + k) });
      o += k;
    }
    if (!ok) return { ok, reason, candidates };
    // seq > 255: every header copy was unreadable and the last good header was reused
    const headerReused = seq > 255;
    const header = { mode, X: Xg, Y: Yg, n: nn, nsym, seq: headerReused ? -1 : seq };
    return {
      ok,
      skipped,
      headerReused,
      header,
      frameKey: headerReused ? null : `${seq}:${Xg}:${Yg}:${mode}:${nn}:${nsym}`,
      codewords,
      stats: { cellPx, corners, markers, cornerFound: !!cornerFound, cwOk, cwTotal, cwCount, corrected },
    };
  }

  // releases the scanner and its input buffers (a 1080p frame buffer is ~10 MB of WASM memory)
  free() {
    if (this.h) X.lm_scanner_free(this.h);
    this.h = 0;
    this.img.free();
    this.skip.free();
    this.hint.free();
  }
}

export class WasmSender {
  // prepared = { payload, meta } from preparePayload (compression stays in JS)
  /**
   * @param {{ payload: Uint8Array, meta: object }} prepared  from preparePayload()
   * @param {{ mode?: number, ecc?: number, X?: number, Y?: number, tid?: number }} [options]
   */
  constructor(prepared, { mode = 1, ecc = 1, X: x, Y: y, tid } = {}) {
    this.tid = tid ?? (Math.random() * 65536) | 0;
    const name = new TextEncoder().encode(prepared.meta.name ?? '');
    const pp = X.lm_alloc(prepared.payload.length);
    u8().set(prepared.payload, pp);
    const np = X.lm_alloc(name.length);
    u8().set(name, np);
    const m = prepared.meta;
    this.h = X.lm_sender_new(pp, prepared.payload.length, np, name.length, m.flags, m.fileSize, m.crc >>> 0, mode, ecc, x, y, this.tid, (Math.random() * 256) | 0);
    X.lm_free(pp, prepared.payload.length);
    X.lm_free(np, name.length);
    if (!this.h) throw new Error('code area too small');
    this.infoPtr = X.lm_sender_info(this.h); // stable address inside the sender
    this._sync();
  }

  _sync() {
    const i = new Uint32Array(X.memory.buffer, X.lm_sender_info(this.h), 10);
    [this.n, this.nsym, this.T, this.perFrame, this._K, this._X, this._Y, this.mode, this.ecc, this.blocks] = i;
    if (!this.layout || this.layout.X !== this._X || this.layout.Y !== this._Y) this.layout = makeLayout(this._X, this._Y);
  }

  get K() {
    return this._K;
  }

  bytesPerFrame() {
    return this.perFrame * this.T;
  }

  resize(x, y) {
    if (x === this.layout.X && y === this.layout.Y) return;
    if (X.lm_sender_resize(this.h, x, y)) this._sync();
  }

  reconfigure({ mode, ecc }) {
    const ok = !!X.lm_sender_reconfigure(this.h, mode, ecc);
    if (ok) this._sync();
    return ok && codewordsPerFrame(this.layout, mode, this.n) > 0;
  }

  nextFrame() {
    const p = X.lm_sender_next_frame(this.h);
    const cells = u8().slice(p, p + this.layout.X * this.layout.Y);
    const seq = new Uint32Array(X.memory.buffer, this.infoPtr, 1)[0]; // next_frame leaves seq in slot 0
    this._sync();
    return { cells, layout: this.layout, seq };
  }

  free() {
    X.lm_sender_free(this.h);
  }
}

const ACTIONS = ['discard', 'keep', 'add', 'accept', 'refuse'];
const STATES = ['collecting', 'receiving', 'refused', 'complete'];

export class WasmReceiver {
  // limits: { maxSize, maxKept, maxTransfers } as for Receiver (PROTOCOL §11.4)
  constructor(limits = null) {
    this.h = limits ? X.lm_receiver_new_limits(limits.maxSize >>> 0, limits.maxKept >>> 0, limits.maxTransfers >>> 0) : X.lm_receiver_new();
    this.buf = new Buf();
  }

  async push(bytes) {
    const p = this.buf.get(bytes.length);
    u8().set(bytes, p);
    return ACTIONS[X.lm_receiver_push(this.h, p, bytes.length)];
  }

  _name() {
    const p = X.lm_receiver_name(this.h);
    const n = X.lm_receiver_name_len(this.h);
    return new TextDecoder().decode(u8().slice(p, p + n));
  }

  progress() {
    const v = new Uint32Array(X.memory.buffer, X.lm_receiver_progress(this.h), 10).slice();
    if (!v[0]) return null;
    const known = v[8] !== 0; // a descriptor is accepted
    return {
      tid: v[1],
      T: v[6],
      state: STATES[v[8]],
      name: known ? this._name() : null,
      size: known ? v[7] : null,
      payloadLength: known ? v[9] : null,
      received: v[2],
      needed: v[3] || null,
      blocks: v[4] || null,
      done: !!v[5],
    };
  }

  get active() {
    const p = this.progress();
    return p ? { T: p.T } : null;
  }

  async tryFinish() {
    const st = X.lm_receiver_finish(this.h);
    if (st === 1) {
      const p = X.lm_receiver_file(this.h);
      const n = X.lm_receiver_file_len(this.h);
      return { name: this._name(), bytes: u8().slice(p, p + n) };
    }
    if (st === 2) return { error: 'checksum', name: null };
    return null;
  }

  free() {
    X.lm_receiver_free(this.h);
  }
}
