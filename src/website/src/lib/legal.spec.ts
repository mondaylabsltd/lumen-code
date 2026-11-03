import { describe, expect, it } from 'vitest';
import { LEGAL, inline } from './legal';

describe('privacy policy and terms', () => {
	it('both languages have the same sections, in the same order', () => {
		for (const doc of ['privacy', 'terms'] as const) {
			const count = (lang: 'en' | 'zh') =>
				LEGAL[lang][doc].sections.map((s) => [s.p?.length ?? 0, s.list?.length ?? 0]);
			expect(count('zh')).toEqual(count('en'));
			expect(LEGAL.zh[doc].summary?.length).toBe(LEGAL.en[doc].summary?.length);
		}
	});

	it('does not hard-code store prices or promise absolute immunity', () => {
		for (const lang of ['en', 'zh'] as const) {
			const text = JSON.stringify(LEGAL[lang].terms);
			expect(text).not.toMatch(/US\$[\d.]+/);
		}
		expect(JSON.stringify(LEGAL.en.terms)).toContain('death or personal injury');
		expect(JSON.stringify(LEGAL.zh.terms)).toContain('法律不允许排除');
	});

	it('inline text: bold and links', () => {
		expect(inline('**Hosting.** See [the policy](https://x.dev/p). Done')).toEqual([
			{ text: 'Hosting.', bold: true },
			{ text: ' See ' },
			{ text: 'the policy', href: 'https://x.dev/p' },
			{ text: '. Done' }
		]);
	});
});
