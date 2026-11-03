<script lang="ts">
	import type { Lang } from '#lib/i18n';
	let { lang }: { lang: Lang } = $props();
	const cells = [
		0, 1, 2, 0, 3, 1, 0, 2, 2, 0, 3, 1, 0, 2, 1, 3, 1, 3, 0, 2, 1, 0, 2, 0, 0, 2, 1, 3, 2, 0, 3, 1,
		3, 1, 0, 2, 0, 3, 1, 2, 0, 2, 3, 1, 2, 1, 0, 3
	];
	const colours = ['#56cce8', '#eb79b1', '#f0ce69', '#dce4ef'];
</script>

{#snippet pattern(x: number, y: number, step: number, cell: number)}
	<g transform={`translate(${x} ${y})`}>
		{#each cells as colour, i (i)}
			<rect
				x={(i % 8) * step}
				y={Math.floor(i / 8) * step}
				width={cell}
				height={cell}
				rx={cell * 0.23}
				fill={colours[colour]}
			/>
		{/each}
	</g>
{/snippet}

<svg
	viewBox="0 0 600 420"
	fill="none"
	role="img"
	aria-label={lang === 'zh'
		? '传输示意：电脑显示彩色画面，手机扫描后收到文件'
		: 'Transfer illustration: a computer shows colour grids and a phone scans them to receive a file'}
>
	<ellipse cx="278" cy="354" rx="242" ry="22" fill="#111923" />
	<!-- A small file, followed by its visual representation on the display. -->
	<rect x="55" y="37" width="142" height="40" rx="12" fill="#111820" stroke="#34414d" />
	<path
		d="M72 47h10l6 6v14H72Zm10 0v6h6M76 58h8m-8 4h6"
		stroke="#a9b6c9"
		stroke-width="1.5"
		stroke-linejoin="round"
	/>
	<text x="100" y="62" fill="#c2cddd" font-size="14" font-family="ui-monospace, monospace"
		>hello.txt</text
	>
	<path d="M125 78v10" stroke="#526172" stroke-width="1.5" />
	<rect
		x="28"
		y="91"
		width="354"
		height="240"
		rx="20"
		fill="#131a24"
		stroke="#536174"
		stroke-width="2"
	/>
	<rect x="43" y="106" width="324" height="198" rx="11" fill="#090e15" />
	{@render pattern(111, 126, 24, 18)}
	<circle cx="205" cy="318" r="3" fill="#536174" />
	<path d="M205 332v25m-57 1h114" stroke="#536174" stroke-width="5" stroke-linecap="round" />
	<!-- Light crosses the space between devices; there is no connecting cable. -->
	<path
		d="m393 155 25-14m-25 52h25m-25 38 25 14"
		stroke="#56cce8"
		stroke-opacity="0.55"
		stroke-width="2"
		stroke-linecap="round"
	/>
	<rect
		x="433"
		y="61"
		width="139"
		height="290"
		rx="28"
		fill="#131a24"
		stroke="#657187"
		stroke-width="2"
	/>
	<rect x="444" y="74" width="117" height="264" rx="19" fill="#090e15" />
	<path d="M487 84h31" stroke="#536174" stroke-width="5" stroke-linecap="round" />
	{@render pattern(456, 127, 12, 8.5)}
	<path
		d="M450 119v-7h8m88 0h8v7m0 90v7h-8m-88 0h-8v-7"
		stroke="#56cce8"
		stroke-width="2"
		stroke-linecap="round"
	/>
	<rect x="453" y="239" width="99" height="59" rx="12" fill="#14271f" stroke="#2d5443" />
	<circle cx="503" cy="257" r="9" fill="#244b39" />
	<path
		d="m498 257 3 3 6-7"
		stroke="#6cdda0"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
	<text x="503" y="283" text-anchor="middle" fill="#a7d8bd" font-size="12"
		>{lang === 'zh' ? '已接收' : 'Received'}</text
	>
	<path d="M488 325h29" stroke="#536174" stroke-width="4" stroke-linecap="round" />
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: auto;
		font-family: var(--font);
	}
</style>
