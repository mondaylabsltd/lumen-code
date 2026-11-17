// Whether the receiver may set the camera's exposure itself (see adaptExposure() in
// receiver.svelte.ts).
//
// Two conditions, both needed. The camera must offer a manual exposure with a time to set.
// And the browser must be one this was measured in: Chrome on Android (a Redmi K40 and a
// Galaxy S22, where the camera's own exposure lasts a whole frame and nothing decodes).
// WebKit is left out by name, whatever its camera offers: Safari gives no exposure setting
// today, the receiver was tuned there without one (iPhone 15 Pro), and should Safari offer it
// one day, nothing here is to change how that phone receives until it has been measured.
// Every browser on iOS is WebKit and says so in navigator.vendor.

interface ExposureCapabilities {
	exposureMode?: string[];
	exposureTime?: { min: number; max: number };
	[other: string]: unknown;
}

export function mayHoldExposure(
	caps: ExposureCapabilities | null | undefined,
	vendor: string
): boolean {
	if (/apple/i.test(vendor)) return false;
	return !!(
		caps &&
		Array.isArray(caps.exposureMode) &&
		caps.exposureMode.includes('manual') &&
		caps.exposureTime &&
		caps.exposureTime.max > caps.exposureTime.min
	);
}

// Where the chroma samples of a camera frame's planes lie among its luma pixels (see
// Scanner::set_chroma_left in src/rust): level with the even luma columns in WebKit's frames,
// centred on their four luma pixels elsewhere. Measured, by codewords decoded when read each
// way: Safari on an iPhone 15 Pro (NV12) 34 of 121 against 24; Chrome on a Galaxy S22 (I420),
// three frames, 0 3 3 of 137 against 4 16 18. With cells of 3 to 4 pixels this quarter of a
// chroma sample decides whether a frame decodes.
export function chromaSiting(vendor: string): 'left' | 'centre' {
	return /apple/i.test(vendor) ? 'left' : 'centre';
}
