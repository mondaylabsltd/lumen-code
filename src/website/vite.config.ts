import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-cloudflare';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { sveltekit } from '@sveltejs/kit/vite';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ViteDevServer } from 'vite';

const repo = fileURLToPath(new URL('../..', import.meta.url));
// the version shown on the pages (as in the apps: "1.0.0 · commit · date")
const pkg = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as {
	version: string;
};
const SITE = 'https://lumencode.link';

// The inline scripts of src/app.html (the language redirect) are not SvelteKit's, so the CSP gets
// their hashes from here; they follow any edit to the file.
const appScripts = [
	...readFileSync(new URL('src/app.html', import.meta.url), 'utf8').matchAll(
		/<script>([\s\S]*?)<\/script>/g
	)
].map((m) => `sha256-${createHash('sha256').update(m[1]).digest('base64')}`);

// The version shown on the pages: the last commit that changed a source of this site (the site
// itself, the JS protocol library, the Rust code of the WASM module, the docs it links), its
// date, and "dirty" when these sources have uncommitted changes. Commit first, then build.
const SOURCES = ['src/website', 'src/core', 'src/rust', 'docs', ':!docs/STATUS.md', 'LICENSE'];
function buildInfo() {
	const git = (...args: string[]) =>
		execFileSync('git', args, {
			cwd: repo,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	try {
		const full = git('log', '-1', '--format=%H', '--', ...SOURCES);
		return {
			commit: full.slice(0, 7),
			full,
			date: git('log', '-1', '--format=%cs', '--', ...SOURCES),
			dirty: git('status', '--porcelain', '--', ...SOURCES) !== '',
			protocol: '1.0',
			version: pkg.version
		};
	} catch {
		return {
			commit: 'unknown',
			full: '',
			date: '',
			dirty: false,
			protocol: '1.0',
			version: pkg.version
		};
	}
}

// Development only: the receiver opened with ?report=<label> posts a line a second here
// (src/lib/recv/receiver.svelte.ts); LUMEN_REPORT names the file they are appended to.
const reportFile = process.env.LUMEN_REPORT;
const report = {
	name: 'lumen-report',
	configureServer(server: ViteDevServer) {
		const body = (req: IncomingMessage, done: (b: Buffer) => void) => {
			const parts: Buffer[] = [];
			req.on('data', (c: Buffer) => parts.push(c));
			req.on('end', () => done(Buffer.concat(parts)));
		};
		// a piece of the camera picture, as the page sees it
		server.middlewares.use('/__frame', (req: IncomingMessage, res: ServerResponse) => {
			body(req, (b) => {
				const cam = /cam=([\w@.]+)/.exec(req.url ?? '')?.[1] ?? 'frame';
				if (reportFile) writeFileSync(`${reportFile}.${cam}.png`, b);
				res.statusCode = 204;
				res.end();
			});
		});
		// whole camera frames, raw RGBA (?grab=<n> on the receiver)
		server.middlewares.use('/__grab', (req: IncomingMessage, res: ServerResponse) => {
			body(req, (b) => {
				const q = new URLSearchParams((req.url ?? '').split('?')[1] ?? '');
				if (reportFile) {
					const base = `${reportFile}.grab-${q.get('w')}x${q.get('h')}@${q.get('fps')}-${q.get('i')}`;
					writeFileSync(`${base}.rgba`, b);
					appendFileSync(
						`${reportFile}.grabs`,
						`${base}.rgba ${q.get('w')} ${q.get('h')} ${q.get('t')}\n`
					);
				}
				res.statusCode = 204;
				res.end();
			});
		});
		server.middlewares.use('/__report', (req: IncomingMessage, res: ServerResponse) => {
			body(req, (b) => {
				if (reportFile) appendFileSync(reportFile, b.toString().replace(/\n/g, ' ') + '\n');
				// the answer carries one command for the page, if the desk left one in
				// <LUMEN_REPORT>.cmd: parameters as a query string (path=camera&grab=12, reload=1)
				let cmd = '';
				try {
					cmd = readFileSync(`${reportFile}.cmd`, 'utf8').trim();
					rmSync(`${reportFile}.cmd`);
				} catch {
					// none
				}
				res.statusCode = cmd ? 200 : 204;
				res.end(cmd);
			});
		});
	}
};

export default defineConfig({
	plugins: [
		report,
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// pre-rendered pages see this origin: canonical links, sitemap, previews
			paths: { origin: SITE },
			// Prerendered pages get this as a <meta> tag, with hashes for the inline scripts. The visit
			// counter may load its one script file and send to its own host, nothing else, so its server
			// cannot switch on extras such as session replay. WebAssembly runs the faster engine; blob:
			// URLs show and save received files; frame-ancestors and the headers a <meta> tag cannot
			// carry are in _headers.
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					'script-src': [
						'self',
						'wasm-unsafe-eval',
						'https://tj.appsdata.org/api/script.js',
						...(appScripts as `sha256-${string}`[])
					],
					'worker-src': ['self'],
					'connect-src': ['self', 'blob:', 'https://tj.appsdata.org'],
					'style-src': ['self'],
					'style-src-attr': ['unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:'],
					'media-src': ['self', 'blob:', 'mediastream:'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['none']
				}
			}
		}),
		// `bun run dev:https`: phones on the local network need HTTPS for the camera
		process.env.HTTPS ? basicSsl() : null
	],
	define: { __BUILD__: JSON.stringify(buildInfo()), __SITE__: JSON.stringify(SITE) },
	// the protocol library (src/core) and the WASM module (dist/wasm) live outside this project
	server: { fs: { allow: [repo] } },
	worker: { format: 'es' },
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
