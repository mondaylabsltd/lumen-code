// The receiver: camera frames go to decode workers, packets to the sink worker (the protocol's
// receiver), and the page shows the progress, the dashboard and, at the end, the file.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { t as tr, type Key, type Lang } from '#lib/i18n';
import { fmtBytes, fmtTime } from '#lib/format';
import { buildText } from '#lib/build';
import { isJson, formatJson, safeName } from '#lib/text-view';
import { chromaSiting, mayHoldExposure } from './exposure';

// phones: 2 decode workers is plenty once scanning is paced; more just burns battery
const FRAME_KEY_MS = 1000; // a frame key names a frame for 1 s (PROTOCOL §11.5)
const MAX_SIZE = 256 * 1024 * 1024; // the reference receiver limit (§11.4), shown when a file is refused
// Region of interest and processing scale, from the newest result. Only this part of the
// camera frame is copied out of the GPU, already downscaled so that a cell is about
// TARGET_CELL pixels: the copy and read-back cost more than the scan itself at full size.
const TARGET_CELL = 6;
// Text messages arrive as UTF-8 "message.txt" (the sender's text tab); show them as text.
const TEXT_NAME = 'message.txt';
// Display limits only: Copy and Save always use the complete text.
export const TEXT_DISPLAY_LIMIT = 1_000_000;
export const HIGHLIGHT_LIMIT = 300_000; // larger JSON is formatted without colours to keep the DOM small
export const LINKIFY_LIMIT = 200_000;

const MIME: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	svg: 'image/svg+xml',
	avif: 'image/avif',
	pdf: 'application/pdf',
	txt: 'text/plain;charset=utf-8',
	md: 'text/plain;charset=utf-8',
	json: 'application/json',
	csv: 'text/csv',
	html: 'text/html',
	mp4: 'video/mp4',
	mov: 'video/quicktime',
	mp3: 'audio/mpeg',
	wav: 'audio/wav',
	zip: 'application/zip'
};
const TEXTY = /\.(txt|md|json|csv|log|js|ts|py|xml|yaml|yml|ini|conf|sh|c|h|cpp|go|rs|java|css)$/i;

type ScanWorker = Worker & { busy: boolean };
interface FrameEntry {
	t: number;
	first: number;
	ok: Set<number>;
	seq: number;
	total: number;
	scans: number;
}

// Captures of a frame that are read whole before its decoded codewords are skipped.
const WHOLE_SCANS = 2;
interface Crop {
	x: number;
	y: number;
	w: number;
	h: number;
	k: number;
	fw: number;
	fh: number;
}

export interface Done {
	name: string;
	title: string;
	sub: string;
	url: string;
	message: boolean; // a text message (not a file)
	text: string | null;
	json: boolean;
	image: boolean;
	lines: string[] | null; // formatted JSON
	stats: [string, string][];
	code: string;
}

export interface Reader {
	view?: 'pretty' | 'raw';
	wrap?: boolean;
	fs?: number;
	stats?: boolean;
}

export class ReceiveController {
	// ---------- what the page shows
	phase = $state<'start' | 'scanning' | 'done'>('start');
	startErr = $state('');
	engine = $state<'js' | 'wasm'>('wasm');
	found = $state(false);
	rxName = $state('');
	pct = $state(0);
	mSpeed = $state('–');
	mEta = $state('–');
	mCell = $state('–');
	mOk = $state('–');
	tip = $state('');
	tipGood = $state(false);
	diag = $state('');
	multiCam = $state(false);
	zoom = $state<{ min: number; max: number } | null>(null);
	zoomLevel = $state(0);
	done = $state<Done | null>(null);
	reader = $state<Reader>({});

	private t: (key: Key) => string;
	private video!: HTMLVideoElement;
	private overlay!: HTMLCanvasElement;
	private octx!: CanvasRenderingContext2D;
	// (development: VITE_LUMEN_PARAMS on the dev server adds parameters to every visit, so a
	// phone can be measured without typing a query string on it)
	private params = new URLSearchParams(
		// (the first of a name counts: the address, then what the desk set, then the server's)
		[
			location.search.slice(1),
			import.meta.env.DEV ? (sessionStorage.getItem('lumen-dev') ?? '') : '',
			import.meta.env.DEV ? (import.meta.env.VITE_LUMEN_PARAMS ?? '') : ''
		]
			.filter(Boolean)
			.join('&')
	);
	private workers: ScanWorker[] = [];
	private sink!: Worker;
	private NW: number;
	private useBitmap =
		typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined';
	private workerErrors = 0;
	// camera frames as planes (see grab()); ?frames=0 keeps to the canvas, for comparing
	private useFrames = typeof VideoFrame !== 'undefined' && this.params.get('frames') !== '0';
	private framePool: Uint8Array[] = [];
	// (development: ?chroma=left or centre, for comparing)
	private chroma = this.params.get('chroma') || chromaSiting(navigator.vendor);
	private scanMs: number[] = [];
	private engineNoteUntil = 0;
	private engineNote = '';
	private running = false;
	private stream: MediaStream | null = null;
	private track: MediaStreamTrack | null = null;
	private deviceIds: string[] = [];
	private deviceIdx = -1;
	private frameId = 0;
	private fallbackCanvas: HTMLCanvasElement | null = null;
	private fallbackCtx: CanvasRenderingContext2D | null = null;
	private lastResult: any = null;
	private lastFoundAt = 0;
	private firstPacketAt = 0;
	private progress: any = null;
	private progHist: [number, number][] = [];
	private scanHist: {
		t: number;
		ok: boolean;
		cwOk: number;
		cwTotal: number;
		cell: number;
		skipped: boolean;
	}[] = [];
	private finished = false;
	private activeTid: number | null = null;
	// frames already decoded, so workers can skip repeats; kept a little longer for the statistics
	private frameDone = new Map<string, FrameEntry>();
	private camFrames: number[] = [];
	private scanTimes: number[] = [];
	private checksumWarnUntil = 0;
	private session: any = null;
	private stillImage: HTMLImageElement | null = null;
	private videoSize: MediaTrackConstraints = {};
	private camRate = 30;
	private camRateAt = 0;
	private zoomPending = false;
	private lastDispatch = 0;
	private senderFpsEst = 0;
	private lastNews: (number | undefined)[] = []; // per codeword place: the last packet that was news
	private captureAt = new Map<number, number>();
	private crop: Crop | null = null;
	private cropAt = 0;
	private cameraWasOn = false;
	private lastUrl: string | null = null;
	private wakeLock: WakeLockSentinel | null = null;
	private hudTimer = 0;

	constructor(lang: Lang) {
		this.t = (key) => tr(lang, key);
		const mobile = matchMedia('(pointer: coarse)').matches;
		// (a phone with six cores takes three as a desktop does: a scan that decodes only part of
		// a frame takes twice as long, and with two workers the camera's frames were then missed)
		const cores = navigator.hardwareConcurrency || 4;
		this.NW = Math.max(1, Math.min(mobile && cores < 6 ? 2 : 3, cores - 1));
		if (import.meta.env.DEV && this.params.get('workers'))
			this.NW = Number(this.params.get('workers'));
		this.rxName = this.t('noData');
		try {
			this.engine = localStorage.getItem('lumen.engine') === 'js' ? 'js' : 'wasm'; // WASM: faster, cooler
			this.reader = JSON.parse(localStorage.getItem('lumen.reader') || '{}') || {};
		} catch {
			/* storage unavailable */
		}
		const e = this.params.get('engine');
		if (e) this.engine = e === 'wasm' ? 'wasm' : 'js';
		this.resetSession();
	}

	attach(video: HTMLVideoElement, overlay: HTMLCanvasElement) {
		this.video = video;
		this.overlay = overlay;
		this.octx = overlay.getContext('2d')!;
		// (development: ?autostart=1 opens the camera without a tap, for a phone driven from the desk)
		if (import.meta.env.DEV && this.params.has('autostart'))
			setTimeout(() => this.openCamera(), 300);
		for (let i = 0; i < this.NW; i++) {
			const w = new Worker(new URL('./scan.worker.ts', import.meta.url), {
				type: 'module'
			}) as ScanWorker;
			w.busy = false;
			w.onmessage = (ev) => this.onResult(w, ev.data);
			w.onerror = (ev) => {
				w.busy = false;
				console.error('scan worker', ev.message);
			};
			this.workers.push(w);
		}
		this.sink = new Worker(new URL('./sink.worker.ts', import.meta.url), { type: 'module' });
		this.sink.onmessage = (ev) => this.onSink(ev.data);
		this.sink.postMessage({ reset: true, engine: this.engine });
		if (!window.isSecureContext) this.startErr = this.t('needHttps');
		this.hudTimer = window.setInterval(() => this.running && this.updateHud(), 500);
	}

	destroy() {
		this.running = false;
		clearInterval(this.hudTimer);
		this.stopStream();
		for (const w of this.workers) w.terminate();
		this.sink?.terminate();
		if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
		if (this.wakeLock) this.wakeLock.release().catch(() => {});
	}

	private resetSession() {
		this.session = {
			scans: 0,
			frames: 0,
			covOk: 0,
			covTot: 0,
			msSum: 0,
			msN: 0,
			prepSum: 0,
			pxSum: 0,
			cellSum: 0,
			cellN: 0,
			header: null,
			received: 0,
			T: 0
		};
		if (this.params.has('debug')) (self as any).lumenSession = this.session; // for measurements
	}

	// ---------- engine
	setEngine(engine: 'js' | 'wasm') {
		if (engine === this.engine) return;
		this.engine = engine;
		try {
			localStorage.setItem('lumen.engine', engine);
		} catch {
			/* ignore */
		}
		this.scanMs = [];
		this.session.msSum = this.session.msN = 0; // engine time in the summary = the engine that finished
		// both engines read the same packets: the reception continues where it is
		this.sink.postMessage({ engine });
		this.updateHud();
	}

	private wasmFailed(why: string) {
		if (this.engine !== 'wasm') return;
		this.engine = 'js';
		this.sink.postMessage({ engine: 'js' }); // keeps the packets received so far
		this.engineNote =
			this.t('wasmFailed') + (why ? ` (${String(why).split('\n')[0].slice(0, 80)})` : '');
		this.engineNoteUntil = performance.now() + 8000;
		this.updateHud();
	}

	// The Rust engine's path for live video: its camera path, which is faster in WebAssembly
	// than the exact one and reads more (measured in Safari on an iPhone 15 Pro, a 420 × 201
	// code filling the picture). ?path=exact asks for the exact path, for comparing.
	private exactPath() {
		return this.params.get('path') === 'exact';
	}
	// Development only (`bun run dev:https`, the page opened with ?report=<label>): a line a
	// second to the dev server, so a phone's browser can be measured from the desk. What the
	// camera says it offers goes with the first line.
	private reportAt = 0;
	private reportedCaps = false;
	private reasons: Record<string, number> = {};
	private lumaCanvas: HTMLCanvasElement | null = null;
	private report(now: number) {
		if (now - this.reportAt < 1000) return;
		this.reportAt = now;
		const track = this.track;
		const settings = track?.getSettings?.() ?? {};
		const line: Record<string, unknown> = {
			label: this.params.get('report'),
			t: Math.round(Date.now() / 1000),
			cam: `${settings.width}x${settings.height}@${settings.frameRate}`,
			video: `${this.video.videoWidth}x${this.video.videoHeight}`,
			speed: this.mSpeed,
			ok: this.mOk,
			cell: this.mCell,
			pct: Math.floor(this.pct),
			diag: this.diag,
			tip: this.tip,
			workers: this.NW,
			bitmap: this.useBitmap,
			path: this.exactPath() ? 'exact' : this.useFrames ? `planes ${this.chroma}` : 'camera',
			note: this.camNote
		};
		// what the camera is set to, and how bright the picture is (a small copy of it)
		const st: any = settings;
		if (st.exposureMode)
			line.exposure = `${st.exposureMode} ${st.exposureTime} iso ${st.iso} comp ${st.exposureCompensation}`;
		const lum = this.brightness(null);
		if (lum) line.luma = `mean ${lum.mean} p95 ${lum.p95}`;
		if (this.expoCaps)
			line.auto = this.expoOn ? `on ${this.expoTime.toFixed(1)} iso ${this.expoIso}` : 'off';
		if (st.zoom) line.zoom = st.zoom;
		if (this.lastSeen && this.video.videoWidth) {
			// how much of the picture's width the code takes
			const xs = this.lastSeen.corners.map((c) => c[0]);
			line.fill = Math.round((100 * (Math.max(...xs) - Math.min(...xs))) / this.video.videoWidth);
		}
		if (Object.keys(this.reasons).length) {
			line.misses = this.reasons; // why scans found no code, this second
			this.reasons = {};
		}
		if (this.benchResult) {
			Object.assign(line, this.benchResult);
			this.benchResult = null;
		}
		const ss = this.session;
		if (ss.msN) line.prep = `${(ss.prepSum / ss.scans).toFixed(1)} ms`;
		if (!this.reportedCaps && track) {
			this.reportedCaps = true;
			line.caps = track.getCapabilities ? track.getCapabilities() : null;
			line.ua = navigator.userAgent;
		}
		fetch('/__report', { method: 'POST', body: JSON.stringify(line) })
			.then((r) => (r.status === 200 ? r.text() : ''))
			.then((cmd) => {
				// parameters set from the desk while the phone stays on the code
				if (!cmd) return;
				const q = new URLSearchParams(cmd);
				const reload = q.has('reload');
				q.delete('reload');
				for (const [k, v] of q) {
					if (v) this.params.set(k, v);
					else this.params.delete(k);
				}
				if (q.has('grab')) this.grabbed = false;
				if (q.has('bench')) this.bench(Number(q.get('bench')));
				// exp=<exposure time, 100 µs units> [iso=<n>] holds an exposure; exp=auto gives it back
				if (q.has('exp') && this.track) {
					const exp = q.get('exp');
					this.params.set('exposure', 'off');
					const set: Record<string, unknown> =
						exp === 'auto'
							? { exposureMode: 'continuous' }
							: { exposureMode: 'manual', exposureTime: Number(exp) };
					if (q.get('iso')) set.iso = Number(q.get('iso'));
					this.track
						.applyConstraints({ advanced: [set as any] })
						.then(() => (this.camNote = `exposure set ${JSON.stringify(set)}`))
						.catch((err) => (this.camNote = `exposure refused: ${err}`));
				}
				if (q.has('probe')) this.probe();
				if (q.has('trycam')) this.tryCameras(q.get('trycam')!);
				if (q.has('zoom')) this.setZoom(Number(q.get('zoom')));
				if (reload) {
					// kept for this tab, so the parameters outlive the reload
					const keep = new URLSearchParams(sessionStorage.getItem('lumen-dev') ?? '');
					for (const [k, v] of q) keep.set(k, v);
					sessionStorage.setItem('lumen-dev', keep.toString());
					location.reload();
				}
			})
			.catch(() => {});
		// every fifth second a piece of the picture as the scanner gets it (the middle, unscaled)
		if (++this.reportN % 5 === 0 && this.video.videoWidth) {
			const [w, h] = [Math.min(480, this.video.videoWidth), Math.min(360, this.video.videoHeight)];
			const c = document.createElement('canvas');
			c.width = w;
			c.height = h;
			const x = (this.video.videoWidth - w) >> 1;
			const y = (this.video.videoHeight - h) >> 1;
			c.getContext('2d')!.drawImage(this.video, x, y, w, h, 0, 0, w, h);
			c.toBlob((b) => {
				if (b) fetch(`/__frame?cam=${line.cam}`, { method: 'POST', body: b }).catch(() => {});
			}, 'image/png');
		}
	}
	private reportN = 0;

	// Development only: scanning stops, and one worker scans the frame now in view n times on
	// each path with nothing else running. Against the times of normal running this tells the
	// engine's own speed from what the workers lose to each other and to the page.
	private benching = false;
	private benchResult: Record<string, unknown> | null = null;
	private async bench(n: number) {
		if (this.benching || !n) return;
		this.benching = true;
		const w = this.workers[0];
		const [sw, sh] = this.sourceSize();
		const bmp = await createImageBitmap(this.video);
		const wait = () =>
			new Promise<void>((done) => {
				const tick = () => (this.workers.some((x) => x.busy) ? setTimeout(tick, 20) : done());
				tick();
			});
		await wait();
		const normal = w.onmessage;
		w.onmessage = (ev) => {
			w.onmessage = normal;
			this.benchResult = { bench: { size: `${sw}x${sh}`, ...ev.data.bench } };
			this.benching = false;
		};
		w.postMessage({ bench: n, bitmap: bmp, dw: sw, dh: sh, engine: this.engine }, [bmp]);
	}

	// Development only: which picture sizes this browser's camera really opens at, and how many
	// frames a second it then gives (trycam=2560x1440,3840x2160,…; add @<fps> to ask for a rate).
	// The camera in use is closed for it and opened again afterwards.
	private async tryCameras(list: string) {
		const out: Record<string, unknown> = {};
		this.running = false;
		this.stopStream();
		for (const item of list.split(',')) {
			const [size, rate] = item.split('@');
			const [w, h] = size.split('x').map(Number);
			const video: MediaTrackConstraints = {
				facingMode: { ideal: 'environment' },
				width: { ideal: w },
				height: { ideal: h }
			};
			if (rate) video.frameRate = { ideal: Number(rate) };
			try {
				const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
				const got = stream.getVideoTracks()[0].getSettings();
				const el = document.createElement('video');
				el.muted = true;
				el.playsInline = true;
				el.srcObject = stream;
				await el.play().catch(() => {});
				let frames = 0;
				let fmt = '';
				const count = () => {
					frames++;
					el.requestVideoFrameCallback(count);
				};
				el.requestVideoFrameCallback(count);
				await new Promise((done) => setTimeout(done, 2000));
				try {
					const vf = new VideoFrame(el);
					fmt = `${vf.format} ${vf.codedWidth}x${vf.codedHeight}`;
					vf.close();
				} catch (err) {
					fmt = String(err);
				}
				out[item] =
					`settings ${got.width}x${got.height}@${got.frameRate} · video ${el.videoWidth}x${el.videoHeight} · ${(frames / 2).toFixed(1)} fps · ${fmt}`;
				for (const tr of stream.getTracks()) tr.stop();
				el.srcObject = null;
			} catch (err) {
				out[item] = `refused: ${err}`;
			}
			await new Promise((done) => setTimeout(done, 400));
		}
		this.benchResult = { trycam: out };
		await this.openCamera();
	}

	// Development only: what a WebCodecs VideoFrame of the camera holds here, and what copying
	// it out costs, against the canvas read-back.
	private async probe() {
		const out: Record<string, unknown> = {};
		try {
			const VF = (self as any).VideoFrame;
			if (!VF) throw new Error('no VideoFrame');
			const vf = new VF(this.video);
			Object.assign(out, {
				format: vf.format,
				coded: `${vf.codedWidth}x${vf.codedHeight}`,
				display: `${vf.displayWidth}x${vf.displayHeight}`,
				rect: vf.visibleRect && [
					vf.visibleRect.x,
					vf.visibleRect.y,
					vf.visibleRect.width,
					vf.visibleRect.height
				],
				rotation: vf.rotation,
				colorSpace: vf.colorSpace?.toJSON?.()
			});
			const time = async (name: string, opts?: unknown) => {
				try {
					const size = vf.allocationSize(opts);
					const buf = new Uint8Array(size);
					const ms: number[] = [];
					let layout: unknown = null;
					for (let i = 0; i < 6; i++) {
						const t = performance.now();
						layout = await vf.copyTo(buf, opts);
						ms.push(Math.round((performance.now() - t) * 10) / 10);
					}
					out[name] = { size, ms, layout };
					return buf;
				} catch (err) {
					out[name] = String(err);
					return null;
				}
			};
			const raw = await time('native');
			await time('rgba', { format: 'RGBA' });
			await time('i420', { format: 'I420' });
			await time('nv12', { format: 'NV12' });
			if (raw)
				fetch(`/__grab?i=vf&w=${vf.codedWidth}&h=${vf.codedHeight}&t=0&fps=${vf.format}`, {
					method: 'POST',
					body: new Blob([raw.buffer as ArrayBuffer])
				}).catch(() => {});
			// the same frame through a canvas, for comparing
			const c = document.createElement('canvas');
			c.width = this.video.videoWidth;
			c.height = this.video.videoHeight;
			const cx = c.getContext('2d', { willReadFrequently: true })!;
			const ms: number[] = [];
			let px: Uint8ClampedArray | null = null;
			for (let i = 0; i < 4; i++) {
				const t = performance.now();
				cx.drawImage(vf, 0, 0);
				px = cx.getImageData(0, 0, c.width, c.height).data;
				ms.push(Math.round((performance.now() - t) * 10) / 10);
			}
			out.canvas = { size: `${c.width}x${c.height}`, ms };
			if (px)
				fetch(`/__grab?i=vfcanvas&w=${c.width}&h=${c.height}&t=0&fps=rgba`, {
					method: 'POST',
					body: new Blob([px.buffer as ArrayBuffer])
				}).catch(() => {});
			vf.close();
		} catch (err) {
			out.error = String(err);
		}
		this.benchResult = { probe: out };
	}

	// Development only: ?grab=<n> sends n consecutive whole camera frames (raw RGBA) to the dev
	// server once a code has been in view for two seconds, for scanning them at the desk.
	private grabbed = false;
	private maybeGrab(now: number) {
		const n = Number(this.params.get('grab') || 0);
		if (!n || this.grabbed || !this.found || now - this.startedAt < 4000) return;
		this.grabbed = true;
		const video = this.video;
		const [w, h] = [video.videoWidth, video.videoHeight];
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
		const frames: { t: number; data: Uint8ClampedArray; raw?: Uint8Array; fmt?: string }[] = [];
		const cam = this.track?.getSettings?.() ?? {};
		const VF = (self as any).VideoFrame;
		const take = async (t: number) => {
			// with WebCodecs: the camera's own planes too, of the same frame
			const vf = VF ? new VF(video) : null;
			ctx.drawImage(vf ?? video, 0, 0);
			const f: (typeof frames)[0] = { t, data: ctx.getImageData(0, 0, w, h).data };
			if (vf) {
				f.raw = new Uint8Array(vf.allocationSize());
				f.fmt = vf.format;
				await vf.copyTo(f.raw);
				vf.close();
			}
			frames.push(f);
			if (frames.length < n) return video.requestVideoFrameCallback(take);
			frames.forEach((f, i) => {
				const q = `i=${i}&w=${w}&h=${h}&t=${f.t.toFixed(1)}`;
				fetch(`/__grab?${q}&fps=${cam.frameRate}`, {
					method: 'POST',
					body: new Blob([f.data.buffer as ArrayBuffer])
				}).catch(() => {});
				if (f.raw)
					fetch(`/__grab?${q}&fps=${f.fmt}`, {
						method: 'POST',
						body: new Blob([f.raw.buffer as ArrayBuffer])
					}).catch(() => {});
			});
		};
		video.requestVideoFrameCallback(take);
	}

	// ---------- camera
	async openCamera() {
		this.startErr = '';
		if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
			this.startErr = this.t('needHttps');
			return;
		}
		const res = this.params.get('res') || '1080';
		const wxh = /^(\d+)x(\d+)$/.exec(res); // (development: ?res=2560x1440)
		const dims = wxh
			? [Number(wxh[1]), Number(wxh[2])]
			: res === '4k'
				? [3840, 2160]
				: res === '720'
					? [1280, 720]
					: [1920, 1080];
		// 30 fps to start; adaptCameraRate() asks for 60 when the sender plays fast enough
		this.videoSize = { width: { ideal: dims[0] }, height: { ideal: dims[1] } };
		this.camRate = 30;
		const video0: MediaTrackConstraints = { ...this.videoSize, frameRate: { ideal: 30, max: 30 } };
		if (this.deviceIdx >= 0 && this.deviceIds[this.deviceIdx])
			video0.deviceId = { exact: this.deviceIds[this.deviceIdx] };
		else video0.facingMode = { ideal: 'environment' };
		try {
			this.stopStream();
			this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: video0 });
		} catch (err) {
			this.startErr = this.t('camErr') + (err instanceof Error ? err.message : String(err));
			return;
		}
		this.track = this.stream.getVideoTracks()[0];
		const video = this.video;
		video.srcObject = this.stream;
		video.removeAttribute('src');
		video.loop = false;
		await video.play().catch(() => {});
		this.setupTrackControls();
		try {
			const devs = await navigator.mediaDevices.enumerateDevices();
			this.deviceIds = devs.filter((d) => d.kind === 'videoinput').map((d) => d.deviceId);
			const cur = this.track.getSettings().deviceId || '';
			this.deviceIdx = Math.max(0, this.deviceIds.indexOf(cur));
			this.multiCam = this.deviceIds.length >= 2;
		} catch {
			/* ignore */
		}
		this.beginScanning();
	}

	switchCamera() {
		if (this.deviceIds.length < 2) return;
		this.deviceIdx = (this.deviceIdx + 1) % this.deviceIds.length;
		this.openCamera();
	}

	private stopStream() {
		if (this.stream) for (const tr of this.stream.getTracks()) tr.stop();
		this.stream = null;
		this.track = null;
	}

	// The camera's rate follows the sender: each sender frame needs two captures (a screen takes
	// some milliseconds over a frame change, and one capture mostly lands in it). The camera runs
	// at the lowest of 30 fps and its doublings, up to what it offers, that gives that.
	//
	// A faster mode is kept only if it still shows the colours. Browsers pick the sensor mode
	// themselves, and a fast one may be binned: Safari on an iPhone 15 Pro gives 720p at 60 fps
	// with the colour smeared over neighbouring cells (every frame located, no codeword decoded;
	// 1080p stays at 30). So a fast mode must have at least 1080 lines, and it is given up for
	// the session when frames are found in it and next to nothing decodes.
	private camNote = '';
	private fastBlocked = false;
	private fastSince = 0;
	private async adaptCameraRate(sender: number, now: number, okRate: number, frames: number) {
		const track = this.track;
		// (development: ?force=1280x720x60 holds a mode whatever it decodes)
		const force = import.meta.env.DEV ? this.params.get('force') : null;
		if (force) {
			if (this.camNote.startsWith('forced') || !track) return;
			const [fw, fh, ff] = force.split('x').map(Number);
			this.camNote = 'forced';
			await track
				.applyConstraints({ width: { ideal: fw }, height: { ideal: fh }, frameRate: { ideal: ff } })
				.catch(() => {});
			const got = track.getSettings();
			this.camNote = `forced ${got.width}x${got.height}@${got.frameRate}`;
			this.camRate = got.frameRate ?? 30;
			return;
		}
		if (!track || !track.applyConstraints || now - this.camRateAt < 2000) return;
		if (this.camRate > 30 && now - this.fastSince > 3000 && frames >= 20 && okRate < 0.15) {
			this.fastBlocked = true;
			this.camNote = `${this.camRate} fps decodes ${Math.round(okRate * 100)}%: back to 30`;
		}
		const caps: any = track.getCapabilities ? track.getCapabilities() : {};
		const max = this.fastBlocked ? 30 : Math.round((caps.frameRate && caps.frameRate.max) || 30);
		const rates = [30, 60, 120, 240].filter((r) => r <= max);
		if (rates[rates.length - 1] !== max && max > 30) rates.push(max);
		const from = (r: number) => (r <= 30 ? 0 : (r * 16) / 60);
		let band = Math.max(0, rates.indexOf(this.camRate));
		while (band + 1 < rates.length && sender >= from(rates[band + 1])) band++;
		while (band > 0 && sender < from(rates[band]) - 3) band--;
		const want = rates[band];
		if (want === this.camRate) return;
		this.camRateAt = now;
		const slow = { ...this.videoSize, frameRate: { ideal: 30, max: 30 } };
		let ok = want <= 30;
		if (!ok) {
			// 16:9 first, then the sensor's own 4:3 (some cameras are fast only there)
			const sizes: MediaTrackConstraints[] = [
				this.videoSize,
				{ width: { ideal: 1920 }, height: { ideal: 1440 } }
			];
			for (const size of sizes) {
				try {
					// the whole set: applyConstraints replaces the constraints, the size included
					await track.applyConstraints({ ...size, frameRate: { min: 0.9 * want, ideal: want } });
				} catch {
					continue;
				}
				const got = track.getSettings();
				ok =
					(got.frameRate ?? 0) >= 0.9 * want && Math.min(got.width ?? 0, got.height ?? 0) >= 1000;
				if (ok) break;
			}
			if (!ok) {
				this.fastBlocked = true;
				const got = track.getSettings();
				this.camNote = `no ${want} fps at 1080 lines (${got.width}x${got.height}@${got.frameRate})`;
			}
		}
		if (!ok || want <= 30) await track.applyConstraints(slow).catch(() => {});
		this.camRate = ok ? want : 30;
		if (ok && want > 30) {
			this.fastSince = performance.now();
			this.camNote = `${want} fps`;
		}
		this.camRateAt = performance.now();
	}

	// How bright the picture is, from a small copy of it (or of the box given, in camera pixels):
	// the mean and the level a twentieth of it is above.
	private brightness(box: number[] | null) {
		const video = this.video;
		if (!video.videoWidth) return null;
		if (!this.lumaCanvas) {
			this.lumaCanvas = document.createElement('canvas');
			this.lumaCanvas.width = 64;
			this.lumaCanvas.height = 36;
		}
		const [x, y, w, h] = box ?? [0, 0, video.videoWidth, video.videoHeight];
		const lc = this.lumaCanvas.getContext('2d', { willReadFrequently: true })!;
		lc.drawImage(video, x, y, w, h, 0, 0, 64, 36);
		const px = lc.getImageData(0, 0, 64, 36).data;
		const ls: number[] = [];
		for (let i = 0; i < px.length; i += 4)
			ls.push((px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8);
		ls.sort((a, b) => a - b);
		return {
			mean: Math.round(ls.reduce((a, b) => a + b, 0) / ls.length),
			p95: ls[Math.floor(ls.length * 0.95)],
			p99: ls[Math.floor(ls.length * 0.99)]
		};
	}

	// ---------- exposure
	// Where the page may set the exposure (Chrome on Android; never WebKit, see exposure.ts):
	// a short one while a code is in view. Left to itself a camera exposes a screen in a
	// room for a whole frame period (measured in Chrome: 30 ms on a Redmi K40, 33 ms on a
	// Galaxy S22): every capture is then two frames blended, the header mostly unreadable and
	// no codeword decodes. At 2 ms the S22 went from nothing to 225 KB/s on average.
	//
	// The time is a sixteenth of the sender's frame, as in the apps, between 1 and 2.5 ms
	// (2 ms until the sender's rate is known). The gain starts where the camera's own exposure
	// would be as bright and then follows the picture: the brightest twentieth of the code is
	// held near white. Three seconds after the code has left the view the camera has its own
	// exposure back. ?exposure=off leaves it alone.
	private expoCaps: any = null;
	private expoOn = false;
	private expoAt = 0;
	private expoBusy = false;
	private expoTime = 0;
	private expoIso = 0;
	private expoSettled = 0; // the gain, at 2 ms, that last gave a well-lit code
	private async adaptExposure(now: number, senderFps: number) {
		const track = this.track;
		const caps = this.expoCaps;
		if (!track || !caps || this.expoBusy || now - this.expoAt < 700) return;
		if (this.params.get('exposure') === 'off') return;
		const inView = now - this.lastLocatedAt < 3000;
		if (!inView && !this.expoOn) return;
		this.expoAt = now;
		const set: Record<string, unknown> = {};
		if (!inView) {
			set.exposureMode = 'continuous';
			this.expoOn = false;
		} else {
			const clamp = (v: number, c: { min: number; max: number }) =>
				Math.min(c.max, Math.max(c.min, v));
			// exposureTime is in units of 100 µs
			const time = clamp(
				senderFps > 0 ? Math.min(25, Math.max(10, 625 / senderFps)) : this.expoTime || 20,
				caps.exposureTime
			);
			let iso = this.expoIso;
			if (caps.iso) {
				if (!this.expoOn) {
					// Where to start: the gain this session last settled on, or 800 at 2 ms (a
					// monitor in a room then reads at about half scale on the two phones
					// measured). Not from the camera's own exposure: a camera that has once been
					// set by hand goes on reporting that setting, not what it does, and a
					// start worked out from it climbed with every return to the code.
					iso = ((this.expoSettled || 800) * 20) / time;
				} else {
					// the code's box; the whole picture while its header cannot be read (there
					// the brightest hundredth: the code may be a small part of it)
					const seen = this.lastSeen;
					let level = 0;
					if (seen && now - seen.at < 1000) {
						const xs = seen.corners.map((c) => c[0]);
						const ys = seen.corners.map((c) => c[1]);
						const [x0, y0] = [Math.max(0, Math.min(...xs)), Math.max(0, Math.min(...ys))];
						const [bw, bh] = [Math.max(...xs) - x0, Math.max(...ys) - y0];
						if (bw > 32 && bh > 32) level = this.brightness([x0, y0, bw, bh])?.p95 ?? 0;
					} else level = this.brightness(null)?.p99 ?? 0;
					// (in steps, and only when well off: a gain that hunts makes every capture
					// a different picture)
					if (level && (level < 150 || level > 225))
						iso *= Math.min(1.6, Math.max(0.6, 190 / Math.max(level, 20)));
					else if (level && seen && now - seen.at < 1000) this.expoSettled = (iso * time) / 20;
					// (without the code's box the picture may be mostly the room: no more than
					// twice the gain the code was last well lit with)
					if (!(seen && now - seen.at < 1000))
						iso = Math.min(iso, (2 * (this.expoSettled || 800) * 20) / this.expoTime);
					iso *= this.expoTime / time;
				}
				iso = Math.round(clamp(iso, caps.iso));
			}
			if (this.expoOn && Math.abs(time - this.expoTime) < 1 && iso === this.expoIso) return;
			set.exposureMode = 'manual';
			set.exposureTime = time;
			if (caps.iso) set.iso = iso;
			this.expoOn = true;
			this.expoTime = time;
			this.expoIso = iso;
		}
		this.expoBusy = true;
		try {
			await track.applyConstraints({ advanced: [set as any] });
		} catch {
			this.expoCaps = null; // refused: the camera keeps its own exposure
			this.expoOn = false;
		}
		this.expoBusy = false;
	}

	private setupTrackControls() {
		const track = this.track!;
		const caps: any = track.getCapabilities ? track.getCapabilities() : {};
		const manual = mayHoldExposure(caps, navigator.vendor);
		this.expoCaps = manual ? caps : null;
		this.expoOn = false;
		// (some cameras keep a manual exposure from the last time they were open)
		if (manual && (track.getSettings() as any).exposureMode !== 'continuous')
			track.applyConstraints({ advanced: [{ exposureMode: 'continuous' } as any] }).catch(() => {});
		if (caps.focusMode && caps.focusMode.includes('continuous')) {
			track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => {});
		}
		if (caps.zoom && caps.zoom.max > caps.zoom.min) {
			this.zoom = { min: caps.zoom.min, max: Math.min(caps.zoom.max, caps.zoom.min * 8) };
			// a restarted camera (after "receive another") keeps the level the user chose
			this.setZoom(
				this.zoomLevel ? this.zoomLevel : (track.getSettings() as any).zoom || caps.zoom.min
			);
		} else this.zoom = null;
	}

	// ---------- zoom: pinch on the camera image; ctrl + wheel (trackpad pinch) on desktop
	setZoom(z: number) {
		if (!this.zoom || !this.track) return;
		this.zoomLevel = Math.min(this.zoom.max, Math.max(this.zoom.min, z));
		if (this.zoomPending) return; // one constraint update per animation frame
		this.zoomPending = true;
		requestAnimationFrame(() => {
			this.zoomPending = false;
			if (this.track)
				this.track
					.applyConstraints({ advanced: [{ zoom: this.zoomLevel } as any] })
					.catch(() => {});
		});
	}

	// ---------- media file (image or recorded video) as a source, for testing
	async openMedia(f: File) {
		this.stopStream();
		const url = URL.createObjectURL(f);
		const video = this.video;
		if (f.type.startsWith('video/')) {
			video.srcObject = null;
			video.src = url;
			video.loop = true;
			await video.play().catch(() => {});
			this.beginScanning();
			return;
		}
		const img = new Image();
		img.onload = () => {
			video.srcObject = null;
			video.poster = url;
			this.beginScanning(img);
		};
		img.src = url;
	}

	private startedAt = 0;
	private okSlow = -1;
	private beginScanning(still?: HTMLImageElement) {
		this.startedAt = performance.now();
		this.phase = 'scanning';
		this.stillImage = still || null;
		this.crop = null;
		this.running = true;
		this.wake();
		this.updateHud();
		if (this.stillImage) {
			// decode the still a few times (each worker once)
			for (const w of this.workers) this.grab(w);
			return;
		}
		this.kick();
	}

	// One frame loop. Starting the camera again (another camera, "receive another") must not
	// start a second one: each would count the camera's frames and ask for scans.
	private pumpQueued = false;
	private lastSeen: { at: number; corners: number[][]; cellPx: number } | null = null;
	private lastLocatedAt = -1e9;
	private located: number[] = [];
	private lastHeaderAt = -1e9;
	private kick() {
		if (!this.pumpQueued) this.pump();
	}

	private sourceSize(): [number, number] {
		if (this.stillImage) return [this.stillImage.naturalWidth, this.stillImage.naturalHeight];
		return [this.video.videoWidth, this.video.videoHeight];
	}

	// While a code is in view every camera frame is scanned (as the apps do, src/app/core/src/
	// engine/recv.rs). A capture of a frame that is already complete costs a header read; one
	// of a frame seen twice before, only the codewords still missing. The first two captures
	// of a frame are read whole: a screen changes frames from top to bottom over several
	// milliseconds, so a capture can carry a new header over cells that still show the frame
	// before. What a codeword's place decodes to is therefore compared with what that place
	// gave last (lastNews): the same packet again is the old frame, not booked to the new one.
	private scanDue(now: number) {
		if (this.finished) return now - this.lastDispatch >= 1000 / 3;
		// the first three seconds after the camera opens: look at every frame, so a code that is
		// already in view locks at once
		if (now - this.startedAt < 3000) return true;
		// searching: 5 scans/s, and 2/s once nothing has been in view for 10 s (phone put down)
		// (where the page sets the exposure, a code located with its header unreadable counts
		// as in view: it is what a code looks like before the exposure is short, and scanning
		// must not slow down in front of it)
		const seen = this.expoCaps ? Math.max(this.lastFoundAt, this.lastHeaderAt) : this.lastFoundAt;
		if (now - seen > 10000) return now - this.lastDispatch >= 1000 / 2;
		if (now - seen > 2000) return now - this.lastDispatch >= 1000 / 5;
		return true;
	}

	private pump = () => {
		this.pumpQueued = false;
		if (!this.running || this.stillImage) return;
		const now = performance.now();
		const video = this.video;
		this.camFrames.push(now);
		while (this.camFrames.length && now - this.camFrames[0] > 2000) this.camFrames.shift();
		if (video.readyState >= 2 && video.videoWidth && !this.benching && this.scanDue(now)) {
			const free = this.workers.find((w) => !w.busy);
			if (free) {
				this.lastDispatch = now;
				this.grab(free);
			}
		}
		this.pumpQueued = true;
		if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(this.pump);
		else requestAnimationFrame(this.pump);
	};

	private skipMap() {
		const now = performance.now();
		const out: Record<string, number[]> = {};
		for (const [key, e] of this.frameDone) {
			if (now - e.first > 4000) this.frameDone.delete(key);
			else if (
				now - e.first <= FRAME_KEY_MS &&
				(e.scans >= WHOLE_SCANS || (e.total && e.ok.size >= e.total))
			)
				out[key] = [...e.ok];
		}
		return out;
	}

	private updateCrop(d: any, capturedAt: number) {
		if (capturedAt < this.cropAt || this.stillImage) return;
		this.cropAt = capturedAt;
		if (!d.ok || !d.stats || !d.w) {
			this.crop = null; // lost: whole frame, full resolution
			return;
		}
		const xs = d.stats.corners.map((c: number[]) => c[0]);
		const ys = d.stats.corners.map((c: number[]) => c[1]);
		const mx = (Math.max(...xs) - Math.min(...xs)) * 0.18 + 24;
		const my = (Math.max(...ys) - Math.min(...ys)) * 0.18 + 24;
		const x0 = Math.max(0, Math.floor(Math.min(...xs) - mx));
		const y0 = Math.max(0, Math.floor(Math.min(...ys) - my));
		const x1 = Math.min(d.w, Math.ceil(Math.max(...xs) + mx));
		const y1 = Math.min(d.h, Math.ceil(Math.max(...ys) + my));
		const k = Math.min(1, Math.max(0.35, TARGET_CELL / d.stats.cellPx));
		if (x1 - x0 < 64 || y1 - y0 < 64) this.crop = null;
		else this.crop = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, k, fw: d.w, fh: d.h };
	}

	private async grab(w: ScanWorker) {
		w.busy = true;
		const id = ++this.frameId;
		this.captureAt.set(id, performance.now());
		const skip = this.skipMap();
		const src = this.stillImage || this.video;
		const [sw, sh] = this.sourceSize();
		// a crop measured on another frame size (the phone was turned) no longer applies
		const c = this.crop;
		const r = c && c.fw === sw && c.fh === sh ? c : { x: 0, y: 0, w: sw, h: sh, k: 1 };
		const dw = Math.max(32, Math.round(r.w * r.k));
		const dh = Math.max(32, Math.round(r.h * r.k));
		const region = { x: r.x, y: r.y, kx: dw / r.w, ky: dh / r.h, fullW: sw, fullH: sh };
		const engine = this.engine;
		const still = !!this.stillImage;
		const exact = this.exactPath();
		// where the code was a moment ago (camera pixels): the scanner looks there first
		const seen = this.lastSeen;
		const hint =
			seen && !still && performance.now() - seen.at < 500
				? { corners: seen.corners, cellPx: seen.cellPx }
				: null;
		try {
			if (this.useFrames && engine === 'wasm' && !still && !exact) {
				// The camera's own planes, where the browser hands them out (WebCodecs): no
				// drawing to a canvas and reading back, which costs as much as the scan itself
				// (Safari on an iPhone 15 Pro, 1920 × 1080: 20 ms against under 1 ms), and the
				// scanner gets what the apps get.
				const vf = new VideoFrame(this.video);
				const fmt = vf.format;
				const upright = vf.codedWidth === sw && vf.codedHeight === sh && !(vf as any).rotation;
				if ((fmt === 'NV12' || fmt === 'I420') && upright) {
					const size = vf.allocationSize();
					let buf = this.framePool.pop();
					if (!buf || buf.byteLength !== size) buf = new Uint8Array(size);
					const layout = await vf.copyTo(buf);
					vf.close();
					// the part with the code, on even pixels (chroma is at half resolution)
					const x = r.x & ~1;
					const y = r.y & ~1;
					const part = {
						x,
						y,
						w: Math.min(sw - x, (r.w + 3) & ~1),
						h: Math.min(sh - y, (r.h + 3) & ~1),
						kx: 1,
						ky: 1,
						fullW: sw,
						fullH: sh
					};
					w.postMessage(
						{
							id,
							yuv: { data: buf, format: fmt, layout, chroma: this.chroma },
							region: part,
							skip,
							engine,
							hint
						},
						[buf.buffer]
					);
					return;
				}
				vf.close();
				// another format (a texture, RGBA): the canvas. A frame turned on its side is
				// only this frame's matter.
				if (upright) this.useFrames = false;
			}
		} catch (err) {
			this.useFrames = false;
			console.warn('camera planes unavailable', err);
		}
		try {
			if (this.useBitmap) {
				// crop + resize happen on the GPU; the worker receives only the small bitmap
				const opts: ImageBitmapOptions | undefined =
					dw < r.w ? { resizeWidth: dw, resizeHeight: dh, resizeQuality: 'medium' } : undefined;
				const bmp = await createImageBitmap(src, r.x, r.y, r.w, r.h, opts);
				w.postMessage({ id, bitmap: bmp, region, dw, dh, skip, engine, still, exact, hint }, [bmp]);
			} else {
				if (!this.fallbackCanvas) {
					this.fallbackCanvas = document.createElement('canvas');
					this.fallbackCtx = this.fallbackCanvas.getContext('2d', { willReadFrequently: true });
				}
				const fc = this.fallbackCanvas;
				if (fc.width < dw || fc.height < dh) {
					fc.width = Math.max(fc.width, dw);
					fc.height = Math.max(fc.height, dh);
				}
				this.fallbackCtx!.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, dw, dh);
				const im = this.fallbackCtx!.getImageData(0, 0, dw, dh);
				w.postMessage(
					{
						id,
						image: { width: dw, height: dh, data: im.data },
						region,
						skip,
						engine,
						still,
						exact,
						hint
					},
					[im.data.buffer]
				);
			}
		} catch (err) {
			w.busy = false;
			console.warn('grab failed', err);
		}
	}

	// ---------- results
	private onResult(w: ScanWorker, d: any) {
		w.busy = false;
		if (d.recycle && this.framePool.length < 4) this.framePool.push(d.recycle);
		const capturedAt = this.captureAt.get(d.id) ?? performance.now();
		this.captureAt.delete(d.id);
		if (d.reason === 'error') {
			console.warn(d.error);
			if (d.wasmError) this.wasmFailed(d.error);
			else if (this.useBitmap && ++this.workerErrors >= 2) this.useBitmap = false; // no OffscreenCanvas 2D in workers
			return;
		}
		const now = performance.now();
		const s = this.session;
		this.lastResult = d;
		if (d.ok && d.stats)
			this.lastSeen = { at: capturedAt, corners: d.stats.corners, cellPx: d.stats.cellPx };
		else if (import.meta.env.DEV) this.reasons[d.reason] = (this.reasons[d.reason] ?? 0) + 1;
		// A code whose header cannot be read is a code all the same: so it looks when the
		// exposure blends two frames. One such scan may be a chance pattern in the room (and the
		// exposure must not go short and back for it): six within a second are a code.
		if (d.ok || d.reason === 'header') {
			this.lastHeaderAt = now;
			this.located.push(now);
			while (now - this.located[0] > 1000) this.located.shift();
			if (d.ok || this.located.length >= 6) this.lastLocatedAt = now;
		}
		if (d.prepMs !== undefined) {
			s.prepSum += d.prepMs;
			s.pxSum += d.px || 0;
		}
		if (d.engine === this.engine && d.ms) {
			this.scanMs.push(d.ms);
			if (this.scanMs.length > 30) this.scanMs.shift();
			s.msSum += d.ms;
			s.msN++;
		}
		s.scans++;
		this.scanTimes.push(now);
		while (this.scanTimes.length && now - this.scanTimes[0] > 2000) this.scanTimes.shift();
		if (d.frameKey) {
			let e = this.frameDone.get(d.frameKey);
			if (e && now - e.first > FRAME_KEY_MS) e = undefined; // the seq came round: a new frame
			if (!e) {
				e = {
					t: now,
					first: now,
					ok: new Set(),
					seq: d.header.seq,
					total: d.stats ? d.stats.cwCount : 0,
					scans: 0
				};
				this.frameDone.set(d.frameKey, e);
				s.frames++;
				s.covTot += e.total;
			}
			e.t = now;
			e.scans++;
			const entry = e;
			(d.okIdx || []).forEach((i: number, k: number) => {
				// the packet this place gave last: the same frame again, or the one before under a new header
				const print: number | undefined = d.prints ? d.prints[k] : undefined;
				if (print !== undefined && this.lastNews[i] === print && !entry.ok.has(i)) return;
				this.lastNews[i] = print;
				if (!entry.ok.has(i)) s.covOk++;
				entry.ok.add(i);
			});
			s.header = d.header;
		}
		if (d.ok && d.stats && !d.skipped) {
			s.cellSum += d.stats.cellPx;
			s.cellN++;
		}
		this.updateCrop(d, capturedAt);
		const rec = { t: now, ok: d.ok, cwOk: 0, cwTotal: 0, cell: 0, skipped: !!d.skipped };
		if (d.ok) {
			this.lastFoundAt = now;
			rec.cwOk = d.stats.cwOk;
			rec.cwTotal = d.stats.cwTotal;
			rec.cell = d.stats.cellPx;
		}
		this.scanHist.push(rec);
		while (this.scanHist.length && now - this.scanHist[0].t > 2500) this.scanHist.shift();
		this.drawOverlay(d);
		if (d.packets && d.packets.length && !this.finished) {
			if (!this.firstPacketAt) this.firstPacketAt = now;
			this.sink.postMessage(
				{ packets: d.packets },
				d.packets.map((p: Uint8Array) => p.buffer)
			);
		}
		this.updateHud();
	}

	private onSink(m: any) {
		if (m.type === 'progress' && m.prog) {
			const now = performance.now();
			if (m.prog.tid !== this.activeTid) {
				this.activeTid = m.prog.tid;
				this.progHist = [];
				this.firstPacketAt = now;
			}
			this.progress = m.prog;
			this.session.received = m.prog.received;
			this.session.T = m.prog.T || this.session.T;
			this.progHist.push([now, m.prog.received]);
			while (this.progHist.length > 2 && now - this.progHist[0][0] > 3000) this.progHist.shift();
			this.updateHud();
		} else if (m.type === 'done') {
			this.showDone(m.name, m.bytes);
		} else if (m.type === 'error') {
			if (m.wasmError) return this.wasmFailed(m.error);
			this.checksumWarnUntil = performance.now() + 3000;
			console.warn('sink', m.error);
		}
	}

	// ---------- overlay: detected code outline
	private drawOverlay(d: any) {
		const overlay = this.overlay;
		const octx = this.octx;
		const dpr = window.devicePixelRatio || 1;
		const W = overlay.clientWidth;
		const H = overlay.clientHeight;
		if (overlay.width !== Math.round(W * dpr) || overlay.height !== Math.round(H * dpr)) {
			overlay.width = Math.round(W * dpr);
			overlay.height = Math.round(H * dpr);
		}
		octx.setTransform(dpr, 0, 0, dpr, 0, 0);
		octx.clearRect(0, 0, W, H);
		if (!d.ok || !d.stats) return;
		const [iw, ih] = [d.w, d.h];
		const scale = Math.max(W / iw, H / ih); // object-fit: cover
		const ox = (W - iw * scale) / 2;
		const oy = (H - ih * scale) / 2;
		const pts = d.stats.corners.map(([x, y]: number[]) => [ox + x * scale, oy + y * scale]);
		const e = d.frameKey && this.frameDone.get(d.frameKey);
		const rate =
			e && e.total
				? e.ok.size / e.total
				: d.skipped
					? 1
					: d.stats.cwCount
						? (d.okIdx || []).length / d.stats.cwCount
						: 0;
		const color = this.moving() || rate > 0.8 ? '#2bdc74' : rate > 0.3 ? '#ffd60a' : '#ff5468';
		octx.lineWidth = 3;
		octx.strokeStyle = color;
		octx.lineJoin = 'round';
		octx.shadowColor = color;
		octx.shadowBlur = 12;
		octx.beginPath();
		pts.forEach(([x, y]: number[], i: number) => (i ? octx.lineTo(x, y) : octx.moveTo(x, y)));
		octx.closePath();
		octx.stroke();
	}

	// ---------- HUD
	// Data is arriving: then the transfer is going well, whatever share of each frame is read.
	private moving() {
		const h = this.progHist;
		return (
			h.length >= 2 && h[h.length - 1][1] > h[0][1] && performance.now() - h[h.length - 1][0] < 2500
		);
	}

	updateHud() {
		const t = this.t;
		const now = performance.now();
		const found = now - this.lastFoundAt < 700;
		const moving = this.moving();
		this.found = found;

		let cell = 0;
		let cellN = 0;
		for (const r of this.scanHist) {
			if (r.ok) {
				cell += r.cell;
				cellN++;
			}
		}
		// success = share of each recently seen frame's codewords that were recovered
		let covOk = 0;
		let covTot = 0;
		for (const e of this.frameDone.values())
			if (now - e.first < 2500 && e.total) {
				covOk += e.ok.size;
				covTot += e.total;
			}
		const okRate = covTot ? covOk / covTot : 0;
		cell = cellN ? cell / cellN : 0;
		this.mCell = cellN ? `${cell.toFixed(1)}px` : '–';
		this.mOk = covTot ? `${Math.round(okRate * 100)}%` : '–';

		const progress = this.progress;
		if (progress) {
			this.rxName = progress.name ? safeName(progress.name) : t('receiving');
			this.pct = progress.needed
				? Math.min(progress.done ? 100 : 99, (100 * progress.received) / progress.needed)
				: 0;
			let rate = 0;
			const h = this.progHist;
			if (h.length >= 2) {
				const [t0, r0] = h[0];
				const [t1, r1] = h[h.length - 1];
				if (t1 > t0) rate = ((r1 - r0) * 1000) / (t1 - t0);
			}
			this.mSpeed = rate > 0 ? `${fmtBytes(rate * (progress.T || 0))}/s` : '–';
			this.mEta =
				progress.needed && rate > 0 ? fmtTime((progress.needed - progress.received) / rate) : '–';
		}

		// capture / decode diagnostics: which link limits the rate?
		const cf = this.camFrames;
		const st = this.scanTimes;
		const camFps = cf.length > 1 ? ((cf.length - 1) * 1000) / (cf[cf.length - 1] - cf[0]) : 0;
		const scanFps = st.length > 1 ? ((st.length - 1) * 1000) / (st[st.length - 1] - st[0]) : 0;
		const recent = [...this.frameDone.values()]
			.filter((e) => now - e.first < 3000)
			.sort((a, b) => a.first - b.first);
		let span = 0;
		for (let i = 1; i < recent.length; i++) {
			const dlt = (recent[i].seq - recent[i - 1].seq + 256) & 255;
			if (dlt > 0 && dlt < 64) span += dlt;
		}
		const dt = recent.length > 1 ? (recent[recent.length - 1].first - recent[0].first) / 1000 : 0;
		const senderFps = dt > 0.5 ? span / dt : 0;
		if (senderFps > 0) this.senderFpsEst = senderFps;
		if (senderFps > 0 && !this.stillImage)
			void this.adaptCameraRate(senderFps, now, okRate, recent.length);
		if (!this.stillImage) void this.adaptExposure(now, senderFps);
		const distinctFps = dt > 0.5 ? (recent.length - 1) / dt : 0;
		// share of the sender's frames that were captured; with a fountain code a missed frame
		// costs only its own data, nothing has to be resent
		const captured = span > 0 ? Math.min(1, (recent.length - 1) / span) : 0;
		const avgMs = this.scanMs.length
			? this.scanMs.reduce((a, b) => a + b, 0) / this.scanMs.length
			: 0;
		// fraction of time the decode workers are busy
		const load = (avgMs * scanFps) / 1000 / this.NW;
		this.diag =
			`${this.engine.toUpperCase()} ${avgMs ? avgMs.toFixed(1) + ' ms' : '–'} · ${t('camFps')} ${camFps.toFixed(0)} · ${t('scanFps')} ${scanFps.toFixed(0)}/s · ${t('frameFps')} ${distinctFps.toFixed(1)}/s` +
			(senderFps
				? ` · ${t('senderFps')} ${senderFps.toFixed(0)}/s · ${t('captured')} ${Math.round(captured * 100)}%`
				: '');

		const camRate = this.track?.getSettings?.().frameRate || camFps;
		// The share that decodes, over some ten seconds: with one capture per sender frame it
		// swings with the phase between the two clocks (measured: 30 % to 100 % within a
		// minute), and advice must not swing with it.
		if (covTot)
			this.okSlow = this.okSlow < 0 ? okRate : this.okSlow + 0.05 * (okRate - this.okSlow);
		const okSlow = this.okSlow < 0 ? okRate : this.okSlow;
		// The rate the camera can follow: a frame has to stay up for one capture period and the
		// time a frame change smears a capture. Of the rates a 60 Hz screen shows evenly, the
		// fastest within 0.7 of the camera's (20 for a camera at 30). Advised when the sender is
		// faster and what decodes on average is less than the slower rate would bring.
		// Measured, a 60 Hz monitor to Safari on an iPhone 15 Pro: 248 KB/s at 30 fps (42 %
		// decoded), 399 KB/s at 20 (80 %). An OLED phone at 30 fps decoded 68 %: no gain from 20.
		const slower = [120, 60, 30, 20, 15, 12, 10].find((n) => n <= 0.7 * camRate) ?? 0;
		let msg: string;
		let good = false;
		if (now < this.engineNoteUntil) msg = this.engineNote;
		else if (now < this.checksumWarnUntil) msg = t('checksum');
		else if (progress && progress.state === 'refused')
			msg = t('tooLarge')
				.replace('{size}', fmtBytes(Math.max(progress.size, progress.payloadLength)))
				.replace('{max}', fmtBytes(MAX_SIZE));
		else if (!found) msg = t('tipSearch');
		else if (
			cellN &&
			(cell < 3.4
				? !moving
				: (cell < 3.9 && okRate < 0.2) ||
					(cell < 6.5 && covTot && okSlow < 0.08 && captured > 0.5 && dt > 2))
		) {
			// Under 4 pixels a cell hardly anything decodes, whatever else is right (measured in
			// Safari: 0–3 % at 3.5–3.8 pixels where 4.1 gave 45 %), and some cameras need more:
			// Chrome on a Redmi K40 gets every frame of a code with 4-pixel cells and no
			// codeword, its colours a third as strong as a Galaxy S22's (1 % at 5.4 pixels, half
			// at 7). When the code already fills the picture, closer is no advice: the sender
			// has to make the cells larger.
			const h = this.lastResult && this.lastResult.header;
			const portrait = this.video.videoHeight > this.video.videoWidth;
			const seen = this.lastSeen;
			const xs = seen ? seen.corners.map((c) => c[0]) : [];
			const ys = seen ? seen.corners.map((c) => c[1]) : [];
			const fills =
				seen &&
				Math.max(
					(Math.max(...xs) - Math.min(...xs)) / this.video.videoWidth,
					(Math.max(...ys) - Math.min(...ys)) / this.video.videoHeight
				) > 0.85;
			msg =
				h && h.X > h.Y * 1.2 && portrait
					? t('tipLandscape')
					: fills
						? t('tipSparser')
						: t('tipCloser');
		} else if (!moving && covTot && okRate < 0.5) msg = cell < 4.5 ? t('tipSteady') : t('tipColor');
		else if (this.engine === 'js' && senderFps && captured < 0.8 && load > 0.8) msg = t('tipWasm');
		else if (
			senderFps &&
			captured > 0.95 &&
			okRate > 0.9 &&
			dt > 2 &&
			load < 0.5 &&
			camFps > 2.2 * senderFps
		) {
			msg = t('tipFpsUp').replace('{n}', String(Math.round(Math.min(camFps / 2, senderFps * 1.5))));
			good = true;
		} else if (
			slower &&
			senderFps > 1.3 * slower &&
			dt > 2 &&
			covTot &&
			okSlow < (0.9 * slower) / senderFps
		) {
			msg = t('tipFpsDown')
				.replace('{cam}', String(Math.round(camRate)))
				.replace('{n}', String(slower));
		} else if (moving && dt > 2 && captured > 0.9 && okSlow > 0.6 && cellN && cell >= 8) {
			// It arrives and the cells are much larger than cameras need: with the frame rate at
			// what the camera can follow, more data per frame is the way up. From 8 pixels only:
			// what a camera needs differs (an iPhone 15 Pro or a Galaxy S22 reads cells of 3.5
			// pixels, a Redmi K40 reads 7 and next to nothing at 5.4)
			msg = t('tipDenser').replace('{px}', cell.toFixed(1));
			good = true;
		} else {
			msg = t('tipGood');
			good = true;
		}
		this.tip = msg;
		if (import.meta.env.DEV && this.params.get('report')) this.report(now);
		if (import.meta.env.DEV) this.maybeGrab(now);
		this.tipGood = good;
	}

	// ---------- completion
	private asText(name: string, bytes: Uint8Array) {
		if ((name !== TEXT_NAME && !TEXTY.test(name)) || bytes.length > 4_000_000) return null;
		try {
			return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		} catch {
			return null;
		}
	}

	// The same numbers as the live dashboard, summed over the whole transfer.
	private doneStats(size: number, secs: number): { stats: [string, string][]; code: string } {
		const t = this.t;
		const s = this.session;
		const h = s.header;
		const wire = s.received * (s.T || 0); // fountain symbols collected (payload after compression)
		const stats: [string, string][] = [
			[t('dTime'), secs >= 0.05 ? `${secs.toFixed(1)} s` : '–'],
			[t('dSpeed'), secs >= 0.5 ? `${fmtBytes(size / secs)}/s` : '–'],
			[t('dWire'), wire ? `${fmtBytes(wire / Math.max(secs, 0.001))}/s` : '–'],
			[t('dFrames'), `${s.frames} / ${s.scans}`],
			[t('okM'), s.covTot ? `${Math.round((100 * s.covOk) / s.covTot)}%` : '–'],
			[
				t('dEngine'),
				`${this.engine.toUpperCase()} ${s.msN ? (s.msSum / s.msN).toFixed(1) + ' ms' : ''}`
			],
			[t('buildLabel'), buildText()]
		];
		const colours = h ? [2, 4, 8][h.mode] || '?' : '';
		const code = h
			? `${t('dCode')} ${h.X}×${h.Y} · ${colours} ${t('dColours')} · ECC ${Math.round((100 * h.nsym) / h.n)}% · ${t('cellM')} ${s.cellN ? (s.cellSum / s.cellN).toFixed(1) + 'px' : '–'}`
			: '';
		return { stats, code };
	}

	private showDone(rawName: string, bytes: Uint8Array) {
		const t = this.t;
		const name = safeName(rawName); // a descriptor can also have no name (§8.4)
		this.finished = true;
		this.running = false;
		// the camera is not needed while the result is on screen: turn it off (power, heat)
		this.cameraWasOn = !!this.stream;
		if (this.stream) {
			this.stopStream();
			this.video.srcObject = null;
		}
		if (this.wakeLock) this.wakeLock.release().catch(() => {});
		const ext = (name.split('.').pop() || '').toLowerCase();
		const blob = new Blob([bytes as BlobPart], { type: MIME[ext] || 'application/octet-stream' });
		if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
		const url = (this.lastUrl = URL.createObjectURL(blob));
		const text = this.asText(name, bytes);
		const message = text !== null && name === TEXT_NAME;
		const json = text !== null && isJson(text);
		const image = (MIME[ext] || '').startsWith('image/');
		const secs = this.firstPacketAt ? (performance.now() - this.firstPacketAt) / 1000 : 0;
		const { stats, code } = this.doneStats(bytes.length, secs);
		const timing =
			secs >= 0.5 ? ` · ${secs.toFixed(1)} s · ${fmtBytes(bytes.length / secs)}/s` : '';
		const lines = json ? formatJson(text!, { html: text!.length <= HIGHLIGHT_LIMIT }) : null;
		let what = fmtBytes(bytes.length);
		if (json) what = `JSON · ${lines!.length.toLocaleString()} ${t('lines')} · ${what}`;
		else if (message) what = `${[...text!].length.toLocaleString()} ${t('chars')} · ${what}`;
		this.done = {
			name,
			title: message ? t(json ? 'jsonReceived' : 'textReceived') : name,
			sub: what + timing,
			url,
			message,
			text,
			json,
			image,
			lines,
			stats,
			code
		};
		this.pct = 100;
		this.phase = 'done';
		this.octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
	}

	saveReader() {
		try {
			localStorage.setItem('lumen.reader', JSON.stringify(this.reader));
		} catch {
			/* ignore */
		}
	}

	again() {
		this.done = null;
		this.sink.postMessage({ reset: true, engine: this.engine });
		this.finished = false;
		this.progress = null;
		this.activeTid = null;
		this.progHist = [];
		this.scanHist = [];
		this.okSlow = -1;
		this.frameDone.clear();
		this.resetSession();
		this.firstPacketAt = 0;
		this.rxName = this.t('noData');
		this.pct = 0;
		this.mSpeed = this.mEta = '–';
		if (this.cameraWasOn) {
			this.cameraWasOn = false;
			this.openCamera(); // same camera as before; starts scanning again
		} else if (this.video.src) {
			this.phase = 'scanning';
			this.running = true;
			this.kick();
		} else this.phase = 'start';
	}

	async wake() {
		try {
			if ('wakeLock' in navigator && !this.wakeLock) {
				this.wakeLock = await navigator.wakeLock.request('screen');
				this.wakeLock.addEventListener('release', () => (this.wakeLock = null));
			}
		} catch {
			/* ignore */
		}
	}

	visible() {
		if (document.visibilityState === 'visible' && this.running) this.wake();
	}
}
