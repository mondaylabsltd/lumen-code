<script lang="ts">
	let { stage }: { stage: number } = $props();
	// Illustrative data, repeated on both screens to show that the camera reads the same picture.
	const cells = [
		0, 1, 2, 0, 3, 1, 0, 2, 2, 0, 3, 1, 0, 2, 1, 3, 1, 3, 0, 2, 1, 0, 2, 0, 0, 2, 1, 3, 2, 0, 3, 1,
		3, 1, 0, 2, 0, 3, 1, 2, 0, 2, 3, 1, 2, 1, 0, 3
	];
	const colours = ['#22d8ff', '#ff3d9a', '#ffd60a', '#e9edf4'];
</script>

{#snippet code(x: number, y: number, size: number)}
	<g transform={`translate(${x} ${y})`}>
		{#each cells as cell, i (i)}
			<rect
				x={(i % 8) * size}
				y={Math.floor(i / 8) * size}
				width={size - 1.5}
				height={size - 1.5}
				rx="1"
				fill={colours[cell]}
			/>
		{/each}
	</g>
{/snippet}

{#snippet file(x: number, y: number)}
	<g transform={`translate(${x} ${y})`}>
		<path
			d="M0 8a8 8 0 0 1 8-8h36l20 20v68a8 8 0 0 1-8 8H8a8 8 0 0 1-8-8Z"
			fill="#11151e"
			stroke="#8b94a7"
			stroke-width="2"
		/>
		<path
			d="M44 0v20h20M14 37h32M14 46h24M14 55h30"
			fill="none"
			stroke="#8b94a7"
			stroke-width="2"
			stroke-linejoin="round"
		/>
		<text x="32" y="78" text-anchor="middle" fill="#e9edf4" font-size="11">file.txt</text>
	</g>
{/snippet}

<svg viewBox="0 0 320 170" fill="none" aria-hidden="true">
	{#if stage === 0}
		{@render file(37, 36)}
		<path
			d="M124 84h40m-8-8 8 8-8 8"
			stroke="#8b94a7"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<rect x="190" y="42" width="94" height="78" rx="8" fill="#07090d" stroke="#3c4555" />
		<rect x="184" y="48" width="94" height="78" rx="8" fill="#07090d" stroke="#3c4555" />
		<rect x="178" y="54" width="94" height="78" rx="8" fill="#07090d" stroke="#8b94a7" />
		{@render code(186, 63, 10)}
	{:else if stage === 1}
		<rect
			x="14"
			y="37"
			width="150"
			height="96"
			rx="9"
			fill="#11151e"
			stroke="#8b94a7"
			stroke-width="2"
		/>
		<rect x="23" y="46" width="132" height="72" rx="3" fill="#07090d" />
		{@render code(50, 53, 10)}
		<path d="M89 133v12m-24 0h48" stroke="#8b94a7" stroke-width="2" stroke-linecap="round" />
		<path
			d="m174 61 38-14m-38 37h38m-38 23 38 14"
			stroke="#22d8ff"
			stroke-opacity="0.45"
			stroke-width="2"
			stroke-linecap="round"
		/>
		<rect
			x="225"
			y="20"
			width="75"
			height="132"
			rx="13"
			fill="#11151e"
			stroke="#8b94a7"
			stroke-width="2"
		/>
		<path d="M253 30h19m-16 112h13" stroke="#8b94a7" stroke-width="3" stroke-linecap="round" />
		{@render code(235, 58, 7)}
		<path
			d="M231 49v-5h6m51 0h6v5m0 62v5h-6m-51 0h-6v-5"
			stroke="#22d8ff"
			stroke-width="2"
			stroke-linecap="round"
		/>
	{:else}
		{@render file(121, 36)}
		<circle cx="204" cy="126" r="19" fill="#0c231b" stroke="#2bdc74" stroke-width="2" />
		<path
			d="m195 126 6 6 12-13"
			stroke="#2bdc74"
			stroke-width="3"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	{/if}
</svg>

<style>
	svg {
		display: block;
		width: min(100%, 320px);
		height: auto;
		margin-inline: auto;
		font-family: var(--mono);
	}
</style>
