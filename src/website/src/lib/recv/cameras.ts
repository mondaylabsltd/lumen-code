// Which camera the receiver opens, and what its "flip" button does.
//
// A browser asked for "the camera at the back" answers with one of several on a phone that has
// more than one, and not always the main one. Chrome on a Galaxy S22 gives its ultra-wide:
// fixed focus and a wider view, so the code is small in the picture and the phone has to be
// held very close. Where the cameras can be told apart, the receiver names the one it wants.
//
// Chrome on Android labels them "camera <n>, facing back" or "facing front", n being the
// system's camera id, and the lowest id on each side is the main camera there (the S22:
// 0 main with autofocus and 2 ultra-wide at the back, 1 and 3 at the front). Other browsers
// give names in the user's language, or none before permission: there the browser's own
// choice for a side stands (Safari's is the main camera).

export interface CameraInfo {
	deviceId: string;
	label: string;
	kind?: string;
}
export type Facing = 'environment' | 'user';
export type MainCameras = Partial<Record<Facing, string>>;

/** The device ids of the main camera on each side, for the sides whose cameras can be told. */
export function mainCameras(devices: CameraInfo[]): MainCameras {
	const best: Partial<Record<Facing, { id: string; n: number }>> = {};
	for (const d of devices) {
		if (d.kind && d.kind !== 'videoinput') continue;
		const m = /camera2?\s+(\d+),\s*facing\s+(back|front)/i.exec(d.label);
		if (!m || !d.deviceId) continue;
		const side: Facing = m[2].toLowerCase() === 'back' ? 'environment' : 'user';
		const n = Number(m[1]);
		const have = best[side];
		if (!have || n < have.n) best[side] = { id: d.deviceId, n };
	}
	const out: MainCameras = {};
	if (best.environment) out.environment = best.environment.id;
	if (best.user) out.user = best.user.id;
	return out;
}
