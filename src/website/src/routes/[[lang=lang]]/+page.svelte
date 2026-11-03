<script lang="ts">
	import { goto } from '$app/navigation';
	import { t as tr, path, type Key } from '#lib/i18n';
	import { LANDING, STORES } from '#lib/landing';
	import { COMPANY, LEGAL } from '#lib/legal';
	import { BUILD, REPO } from '#lib/build';
	import Mark from '#lib/ui/Mark.svelte';
	import Seo from '#lib/ui/Seo.svelte';
	import HeroScene from '#lib/ui/HeroScene.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const lang = $derived(data.lang);
	const t = (key: Key) => tr(lang, key);
	const c = $derived(LANDING[lang]);
	const zh = $derived(lang === 'zh');
	const buildGuide = `${REPO}#native-apps-ios-android-desktop`;
	// the desktop files of this version's GitHub release (names from build-macos-app.sh and
	// desktop-packages.yml)
	const asset = (file: string) =>
		`${REPO}/releases/download/v${BUILD.version}/LumenCode-${BUILD.version}-${file}`;
	type Link = { label: string; href: string; external?: boolean };
	const store = (label: string, href: string | null): Link[] =>
		href ? [{ label, href, external: true }] : [];
	// per card of the Apps section, in its order: web, iPhone, Android, desktop
	const appLinks: Link[][] = $derived([
		[
			{ label: c.hero.send, href: path(lang, 'send') },
			{ label: c.hero.recv, href: path(lang, 'recv') }
		],
		store('App Store', STORES.appStore),
		store('Google Play', STORES.googlePlay),
		[
			{ label: 'macOS', href: asset('macos-universal.dmg'), external: true },
			{ label: 'Windows', href: asset('windows-x86_64.zip'), external: true },
			{ label: 'Linux x86_64', href: asset('linux-x86_64.tar.gz'), external: true },
			{ label: 'Linux ARM64', href: asset('linux-aarch64.tar.gz'), external: true }
		]
	]);
	const stores = [
		{ name: 'App Store', url: STORES.appStore },
		{ name: 'Google Play', url: STORES.googlePlay }
	];

	// the other language: remembered, then opened (the redirect in app.html honours the choice)
	function switchLang() {
		const next = zh ? 'en' : 'zh';
		try {
			localStorage.setItem('lumen.lang', next);
		} catch {
			/* ignore */
		}
		goto(path(next, ''));
	}

	const appIcons = [
		'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM3.5 12h17M12 3c2.4 2.7 3.6 5.7 3.6 9s-1.2 6.3-3.6 9c-2.4-2.7-3.6-5.7-3.6-9S9.6 5.7 12 3z',
		'M8 2.5h8a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2zM10.5 5h3M11 18.5h2',
		'M7.5 3h9A1.5 1.5 0 0 1 18 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5v-15A1.5 1.5 0 0 1 7.5 3zM12 5.6h.01M9.5 18.4h5',
		'M3.5 4.5h17a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1zM8 20.5h8M12 16.5v4'
	];

	// structured data for search engines: the software (free web and desktop versions), the site,
	// and the questions on this page
	const jsonLd = $derived({
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'SoftwareApplication',
				name: 'Lumen Code',
				description: t('descHome'),
				url: `${__SITE__}${path(lang, '')}`,
				applicationCategory: 'UtilitiesApplication',
				operatingSystem: 'Web, macOS, Windows, Linux, iOS, Android',
				softwareVersion: BUILD.version,
				downloadUrl: `${REPO}/releases`,
				license: 'https://opensource.org/licenses/MIT',
				isAccessibleForFree: true,
				offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
			},
			{
				'@type': 'WebSite',
				name: 'Lumen Code',
				url: `${__SITE__}${path(lang, '')}`,
				inLanguage: zh ? 'zh-CN' : 'en'
			},
			{
				'@type': 'FAQPage',
				mainEntity: c.faq.items.map((f) => ({
					'@type': 'Question',
					name: f.q,
					acceptedAnswer: { '@type': 'Answer', text: f.a }
				}))
			}
		]
	});
</script>

<Seo {lang} page="" title={t('titleHome')} description={t('descHome')} {jsonLd} />

<div class="site">
	<a class="skip" href="#main">{zh ? '跳到正文' : 'Skip to content'}</a>

	<header class="bar">
		<nav class="wrap nav" aria-label="Lumen Code">
			<a class="brand" href={path(lang, '')}><Mark /><span>Lumen Code</span></a>
			<div class="links">
				<a href="#apps">{c.nav.apps}</a>
				<a href="#speed">{c.nav.speed}</a>
				<a href="#pricing">{c.nav.pricing}</a>
				<a class="gh" href={REPO} title={t('ghTitle')} aria-label={t('ghTitle')} rel="external">
					<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"
						><path
							d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
						/></svg
					>
				</a>
				<button class="pill" id="lang" onclick={switchLang} lang={zh ? 'en' : 'zh-CN'}
					>{zh ? 'English' : '中文'}</button
				>
			</div>
		</nav>
	</header>

	<main id="main">
		<section class="hero wrap">
			<div class="hero-text">
				<h1><span>{c.hero.title[0]}</span><br /><em>{c.hero.title[1]}</em></h1>
				<div class="actions">
					<a class="button primary" href={path(lang, 'send')}>{c.hero.send}</a>
					<a class="button tonal" href={path(lang, 'recv')}>{c.hero.recv}</a>
				</div>
			</div>
			<figure class="hero-visual">
				<HeroScene {lang} />
				<figcaption>{zh ? '传输示意' : 'Transfer illustration'}</figcaption>
			</figure>
		</section>

		<section id="apps" class="section wrap">
			<h2>{c.apps.title}</h2>
			<ul class="grid four">
				{#each c.apps.items as item, i (item.name)}
					<li class="card">
						<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d={appIcons[i]} /></svg>
						<h3>{item.name}</h3>
						<p class="req">{item.req}</p>
						<div class="stores">
							{#each appLinks[i] as l (l.href)}
								<a class="store" href={l.href} rel={l.external ? 'external' : undefined}
									>{l.label}</a
								>
							{:else}
								<span class="store soon">{c.soon}</span>
							{/each}
						</div>
					</li>
				{/each}
			</ul>
		</section>

		<section id="speed" class="section wrap">
			<h2>{c.speed.title}</h2>
			<div class="card table-card">
				<table>
					<thead>
						<tr>
							{#each c.speed.head as cell (cell)}<th scope="col">{cell}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each c.speed.rows as row (row[0])}
							<tr>
								<th scope="row">{row[0]}</th><td>{row[1]}</td><td class="measured-rate">{row[2]}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="caption">
				{c.speed.note}
				<a
					href={`${REPO}/blob/main/docs/${zh ? 'guide/04-performance.zh-CN.md#42-设备实测' : 'guide/04-performance.md#42-real-device-results'}`}
					rel="external">{c.speed.more} →</a
				>
			</p>
		</section>

		<section id="pricing" class="section wrap">
			<h2>{c.pricing.title}</h2>
			<p class="section-lead">{c.pricing.lead}</p>
			<div class="plans">
				<div class="card plan">
					<h3>{c.pricing.build.name}</h3>
					<p class="price">{c.pricing.build.price} <small>{c.pricing.build.per}</small></p>
					<ul>
						{#each c.pricing.build.points as point (point)}<li>{point}</li>{/each}
					</ul>
					<a class="button tonal" href={buildGuide} rel="external">{c.pricing.build.action}</a>
				</div>
				<div class="card plan featured">
					<h3>{c.pricing.store.name}</h3>
					<p class="price">{c.pricing.store.price} <small>{c.pricing.store.per}</small></p>
					<div class="stores">
						{#if stores.some((s) => s.url)}
							{#each stores as s (s.name)}
								{#if s.url}<a class="store" href={s.url} rel="external">{s.name}</a>{/if}
							{/each}
						{:else}
							<span class="store soon">{c.soon}</span>
						{/if}
					</div>
				</div>
			</div>
			<p class="caption">{c.pricing.note}</p>
		</section>

		<section id="faq" class="section wrap">
			<h2>{c.faq.title}</h2>
			<div class="questions">
				{#each c.faq.items as item (item.q)}
					<details>
						<summary>{item.q}</summary>
						<p>{item.a}</p>
					</details>
				{/each}
			</div>
		</section>

		<section class="cta wrap">
			<span class="cta-mark"><Mark /></span>
			<h2>{c.cta.title}</h2>
			<div class="actions center">
				<a class="button primary" href={path(lang, 'send')}>{c.hero.send}</a>
				<a class="button tonal" href={path(lang, 'recv')}>{c.hero.recv}</a>
			</div>
		</section>
	</main>

	<footer class="footer">
		<div class="wrap footer-inner">
			<div class="brand"><Mark /><span>Lumen Code</span></div>
			<p>{c.license}</p>
			<p class="legal-links">
				<a href={path(lang, 'privacy')}>{LEGAL[lang].privacy.title}</a> ·
				<a href={path(lang, 'terms')}>{LEGAL[lang].terms.title}</a> ·
				<a
					href={path(zh ? 'en' : 'zh', '')}
					hreflang={zh ? 'en' : 'zh-CN'}
					lang={zh ? 'en' : 'zh-CN'}>{zh ? 'English' : '中文'}</a
				>
			</p>
			<p class="quiet">© 2026 {COMPANY}</p>
		</div>
	</footer>
</div>

<style>
	.site {
		--width: 1120px;
		--gutter: 20px;
		--nav-height: 64px;
		--surface: #0f131b;
		--accent: #7fe3ff;
		font-size: 17px;
		line-height: 1.6;
		min-height: 100%;
		background:
			radial-gradient(60rem 30rem at 85% -5%, rgba(34, 216, 255, 0.08), transparent 70%),
			radial-gradient(50rem 30rem at -10% 10%, rgba(255, 61, 154, 0.06), transparent 70%), var(--bg);
	}
	@media (max-width: 640px) {
		.site {
			--gutter: 16px;
			font-size: 16px;
		}
	}
	:global(html) {
		scroll-padding-top: 80px;
	}
	@media (prefers-reduced-motion: no-preference) {
		:global(html) {
			scroll-behavior: smooth;
		}
	}
	.wrap {
		width: min(var(--width), 100% - 2 * var(--gutter));
		margin-inline: auto;
	}
	h1,
	h2,
	h3,
	p {
		margin: 0;
	}
	h2,
	h3 {
		line-height: 1.2;
		letter-spacing: -0.01em;
	}
	a {
		color: var(--accent);
	}
	.skip {
		position: absolute;
		left: -999px;
		top: 8px;
		z-index: 10;
		padding: 8px 12px;
		border-radius: 8px;
		background: var(--surface);
	}
	.skip:focus {
		left: 8px;
	}

	/* header */
	.bar {
		position: sticky;
		top: 0;
		z-index: 5;
		background: rgba(7, 9, 13, 0.82);
		backdrop-filter: saturate(1.4) blur(12px);
		-webkit-backdrop-filter: saturate(1.4) blur(12px);
		border-bottom: 1px solid var(--line);
		padding-top: env(safe-area-inset-top);
	}
	.nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: var(--nav-height);
		gap: 16px;
	}
	.brand {
		color: var(--text);
		font-size: 18px;
	}
	.links {
		display: flex;
		align-items: center;
		gap: 22px;
		font-size: 15px;
	}
	.links a {
		color: var(--muted);
		text-decoration: none;
	}
	.links a:hover {
		color: var(--text);
	}
	.gh {
		display: grid;
		place-items: center;
	}
	.gh svg {
		width: 19px;
		height: 19px;
	}
	.pill {
		border: 1px solid var(--line-2);
		background: var(--surface);
		color: var(--text);
		border-radius: 999px;
		padding: 5px 14px;
		font-size: 15px;
		cursor: pointer;
	}
	@media (max-width: 760px) {
		.links a:not(.gh) {
			display: none;
		}
	}

	/* hero */
	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
		min-height: calc(100svh - var(--nav-height) - 1px - env(safe-area-inset-top));
		gap: 56px;
		align-content: center;
		align-items: center;
		padding-block: 72px 48px;
	}
	h1 {
		font-size: clamp(40px, 6.4vw, 72px);
		line-height: 1.04;
		letter-spacing: -0.03em;
		font-weight: 750;
	}
	h1 em {
		font-style: normal;
		background: linear-gradient(90deg, var(--cyan), var(--pink) 55%, var(--amber));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 32px;
	}
	.actions.center {
		justify-content: center;
	}
	.button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 48px;
		padding: 0 24px;
		border-radius: 12px;
		font-weight: 600;
		text-decoration: none;
		transition:
			background 0.15s,
			transform 0.1s;
	}
	.button:active {
		transform: scale(0.98);
	}
	.button.primary {
		background: #f2f4f8;
		color: #0a0d14;
		box-shadow: 0 8px 28px rgba(34, 216, 255, 0.18);
	}
	.button.primary:hover {
		background: #fff;
	}
	.button.tonal {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid var(--line-2);
		color: var(--text);
	}
	.button.tonal:hover {
		background: rgba(255, 255, 255, 0.1);
	}
	.hero-visual {
		margin: 0;
		width: 100%;
	}
	.hero-visual figcaption {
		margin-top: 4px;
		color: var(--muted);
		font-size: 13px;
		text-align: center;
	}
	@media (max-width: 900px) {
		.hero {
			grid-template-columns: minmax(0, 1fr);
			gap: 40px;
			padding-block: 40px 32px;
		}
		.hero-visual {
			max-width: 560px;
			margin-inline: auto;
		}
	}

	/* sections */
	.section {
		padding-block: 72px;
	}
	.section h2,
	.cta h2 {
		font-size: clamp(28px, 4vw, 42px);
		letter-spacing: -0.02em;
	}
	.section-lead {
		margin-top: 14px;
		color: var(--muted);
		max-width: 46em;
	}
	.caption {
		margin-top: 16px;
		color: var(--faint);
		font-size: 14px;
		max-width: 60em;
	}
	.card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
	}
	h3 {
		font-size: 18px;
	}

	/* speed */
	.table-card {
		margin-top: 36px;
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 15.5px;
	}
	th,
	td {
		text-align: left;
		padding: 14px 20px;
		border-bottom: 1px solid var(--line);
		vertical-align: middle;
	}
	thead th {
		color: var(--faint);
		font-weight: 600;
		font-size: 14px;
	}
	tbody tr:last-child > * {
		border-bottom: 0;
	}
	tbody th {
		font-weight: 500;
		color: var(--text);
	}
	td {
		color: var(--muted);
	}
	.measured-rate {
		color: var(--cyan);
		font-size: clamp(20px, 2.8vw, 32px);
		font-weight: 650;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	@media (max-width: 560px) {
		th,
		td {
			padding: 12px 10px;
			font-size: 13px;
		}
		tbody th,
		tbody td:not(.measured-rate) {
			white-space: nowrap;
		}
	}

	/* cards */
	.grid {
		display: grid;
		gap: 16px;
		list-style: none;
		padding: 0;
		margin: 36px 0 0;
	}
	.grid.four {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
	.grid li {
		padding: 24px;
	}
	.grid p {
		margin-top: 8px;
		color: var(--muted);
		font-size: 15.5px;
	}
	.grid p.req {
		margin-top: 4px;
		color: var(--accent);
		font-size: 14px;
	}
	.icon {
		width: 28px;
		height: 28px;
		margin-bottom: 14px;
		fill: none;
		stroke: var(--cyan);
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	@media (max-width: 960px) {
		.grid.four {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 560px) {
		.grid.four {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.caption a {
		white-space: nowrap;
	}

	/* pricing */
	.plans {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
		margin-top: 36px;
	}
	.plan {
		display: flex;
		flex-direction: column;
		padding: 28px;
	}
	.plan.featured {
		border-color: rgba(34, 216, 255, 0.55);
		background:
			linear-gradient(160deg, rgba(34, 216, 255, 0.1), rgba(255, 61, 154, 0.06) 60%, transparent),
			var(--surface);
		box-shadow:
			0 0 0 1px rgba(34, 216, 255, 0.15),
			0 20px 60px rgba(34, 216, 255, 0.08);
	}
	.price {
		margin-top: 18px;
		font-size: 38px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.price small {
		font-size: 15px;
		font-weight: 400;
		color: var(--faint);
		letter-spacing: 0;
	}
	.plan ul {
		margin: 16px 0 24px;
		padding-left: 20px;
		color: var(--muted);
		font-size: 15.5px;
		flex: 1;
	}
	.plan li + li {
		margin-top: 6px;
	}
	.plan .button {
		align-self: flex-start;
	}
	.card .stores {
		margin-top: 16px;
	}
	.stores {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.store {
		display: inline-flex;
		align-items: center;
		min-height: 40px;
		padding: 0 14px;
		border-radius: 10px;
		font-size: 14px;
		text-decoration: none;
		color: var(--text);
		border: 1px solid var(--line-2);
	}
	.store.soon {
		color: var(--faint);
		border-style: dashed;
	}
	@media (max-width: 900px) {
		.plans {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	/* faq */
	.questions {
		margin-top: 32px;
		border-top: 1px solid var(--line);
	}
	details {
		border-bottom: 1px solid var(--line);
	}
	summary {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding: 20px 0;
		font-weight: 600;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary::after {
		content: '+';
		color: var(--cyan);
		font-size: 22px;
		line-height: 1;
		transition: transform 0.2s;
	}
	details[open] summary::after {
		transform: rotate(45deg);
	}
	details p {
		padding-bottom: 20px;
		color: var(--muted);
		max-width: 48em;
	}

	/* closing */
	.cta {
		margin-block: 40px 80px;
		padding: 64px 24px;
		text-align: center;
		border-radius: 24px;
		border: 1px solid var(--line);
		background:
			radial-gradient(40rem 16rem at 50% 0%, rgba(34, 216, 255, 0.12), transparent 70%),
			radial-gradient(30rem 14rem at 50% 100%, rgba(255, 61, 154, 0.1), transparent 70%),
			var(--surface);
	}
	.cta-mark {
		display: inline-block;
		margin-bottom: 24px;
		transform: scale(1.8);
	}

	/* footer */
	.footer {
		border-top: 1px solid var(--line);
		padding-block: 40px calc(48px + env(safe-area-inset-bottom));
		color: var(--muted);
		font-size: 14px;
	}
	.footer-inner {
		display: grid;
		gap: 10px;
	}
	.footer .brand {
		color: var(--text);
		font-size: 16px;
		margin-bottom: 4px;
	}
	.footer a {
		text-decoration: none;
	}
	.footer a:hover {
		text-decoration: underline;
	}
	.quiet {
		color: var(--faint);
	}
</style>
