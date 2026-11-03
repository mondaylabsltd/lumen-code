// The home page and the store descriptions state numbers about the protocol and the apps. Each
// test here recomputes a number from the implementation (src/core, the app core's sources, the
// web app) or from the protocol (docs/PROTOCOL.md) and checks that the texts say exactly that,
// in both languages. Change the code or the spec and these fail until the texts follow.
// Field measurements cannot be recomputed from capacity; their scope is documented in the guide.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { LANDING } from './landing';
import pkg from '../../package.json' with { type: 'json' };
import { RECEIVER_LIMITS } from '../../../core/transfer.js';

const repo = new URL('../../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repo), 'utf8');
const LANGS = ['en', 'zh'] as const;
const page = (lang: (typeof LANGS)[number]) => JSON.stringify(LANDING[lang]);
const store = { en: read('store/description-en.txt'), zh: read('store/description-zh.txt') };
const coreApp = read('src/app/core/src/app/mod.rs');
const sendPage = read('src/website/src/routes/[[lang=lang]]/send/+page.svelte');
const androidCamera = read('src/android/app/src/main/java/com/shelchin/lumen/platform/Camera.kt');
const num = (re: RegExp, text: string) => Number(re.exec(text)?.[1]);

describe('settings the apps offer', () => {
	it('error correction: the levels every interface offers', () => {
		const appMax = num(/self\.ecc = self\.ecc\.min\((\d)\)/, coreApp);
		const webLevels = [...sendPage.matchAll(/\[(\d), 'e(?:Low|Mid|High|Max)'\]/g)].map((m) =>
			Number(m[1])
		);
		expect(webLevels).toEqual([...Array(appMax + 1).keys()]);
	});

	it('frame rate: the web controls use the app core range', () => {
		const min = num(/pub const MIN_FPS: u32 = (\d+)/, coreApp);
		const max = num(/pub const MAX_FPS: u32 = (\d+)/, coreApp);
		expect([num(/min="(\d+)"/, sendPage), num(/max="(\d+)"/, sendPage)]).toEqual([min, max]);
	});

	it('phone cameras: the fastest capture a sender can ask for (README)', () => {
		const maxFps = num(/pub const MAX_FPS: u32 = (\d+)/, coreApp);
		// the core's capture bands: (camera fps, sender fps from which it is chosen, …)
		const bands = [
			...(/const BANDS[^=]*= \[([^;]*)\];/.exec(coreApp)?.[1] ?? '').matchAll(/\((\d+), ([\d.]+),/g)
		].map((m) => [Number(m[1]), Number(m[2])]);
		expect(bands.length).toBeGreaterThan(1);
		// faster bands exist for faster senders, but no Lumen Code sender plays above MAX_FPS
		const iphone = Math.max(...bands.filter(([, from]) => from <= maxFps).map(([fps]) => fps));
		const android = num(/maxFps\(\): Int = if \(rangeFor\((\d+)\)/, androidCamera);
		expect(read('README.md')).toContain(
			`up to ${iphone} fps on iPhone and ${android} fps on Android`
		);
		expect(read('README.zh-CN.md')).toContain(
			`iPhone 最高 ${iphone} 帧，Android 最高 ${android} 帧`
		);
		// the screen refresh rate is not a code rate: codes change at most MAX_FPS times a second
		for (const lang of LANGS) expect(page(lang)).not.toMatch(/\bHz\b/);
	});

	it('desktop downloads: the file names the release builds', () => {
		// the home page links LumenCode-<version>-{macos-universal.dmg, windows-x86_64.zip,
		// linux-x86_64.tar.gz, linux-aarch64.tar.gz} of the release tagged v<version>
		const packages = read('.github/workflows/desktop-packages.yml');
		expect(read('src/desktop/scripts/build-macos-app.sh')).toContain(
			'dmg="$out/LumenCode-$version-macos-$arch.dmg"'
		);
		expect(read('src/desktop/scripts/release-macos-local.sh')).toContain('--arch universal');
		expect(packages).toContain('name="LumenCode-$version-linux-${{ matrix.arch }}"');
		expect(packages).toContain('tar -czf "$name.tar.gz"');
		expect(packages).toMatch(/- arch: x86_64[\s\S]*- arch: aarch64/);
		expect(packages).toContain('$name = "LumenCode-$version-windows-x86_64"');
		expect(packages).toMatch(/\$name\.zip/);
		// the release tag is v + the desktop app's version, and the site is built with the same one
		expect(read('src/desktop/Cargo.toml')).toMatch(new RegExp(`^version = "${pkg.version}"$`, 'm'));
	});
});

describe('protocol figures', () => {
	it('receiver size limit (JS and Rust reference receivers)', () => {
		const mib = RECEIVER_LIMITS.maxSize / 2 ** 20;
		expect(read('src/rust/src/transfer.rs')).toContain(`max_size: ${mib} << 20`);
		for (const lang of LANGS) {
			expect(store[lang]).toContain(`${mib} MiB`);
		}
	});
});
