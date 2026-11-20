// How the phone is held, for the receiver's status and panel.
//
// A code on a monitor is wide, and the phone is turned on its side to fill the picture with
// it. With the phone's rotation locked the browser stays upright, and the page turns its own
// status and panel instead, as the apps do. (A browser that turns with the phone has turned
// the page already; nothing is added then. A page cannot keep the browser from turning:
// Chrome allows an orientation lock only in full screen, Safari not at all.)
//
// From gravity along the screen's axes, in g (x to the right, y up; upright: y = 1). 1 and -1:
// a quarter turn clockwise / anticlockwise brings the content upright. Flat on a table,
// upside down or in between, it stays as it was.
export function quarterFrom(x: number, y: number, prev: number): number {
	if (Math.abs(x) > 0.75 && Math.abs(y) < 0.5) return x > 0 ? 1 : -1; // on its side: the right edge up, or the left
	if (y > 0.75) return 0; // upright
	return prev;
}

/**
 * The same from the code in the picture, where the browser does not say how the phone is
 * held: a code on a screen stands upright, so the way its top edge runs across the picture
 * is the way the phone is held. `corners` in the code's own order (top left, top right,
 * bottom right, bottom left), in picture pixels (y down). Upside down or askew, it stays as
 * it was. Where the browser has turned with the phone the picture has too, and this gives 0.
 */
export function quarterOfCode(corners: number[][], prev: number): number {
	const [tl, tr, br, bl] = corners;
	const dx = tr[0] - tl[0] + br[0] - bl[0];
	const dy = tr[1] - tl[1] + br[1] - bl[1];
	if (Math.abs(dy) > 2 * Math.abs(dx)) return dy > 0 ? 1 : -1; // the code's right is down the picture, or up
	if (dx > 2 * Math.abs(dy)) return 0;
	return prev;
}

/**
 * Whether the browser reports motion without asking the person. WebKit is left out by name,
 * not by what it does today: Safari asks first, so there the page asks (with the camera, from
 * a tap), and goes by the code (quarterOfCode) until it is allowed.
 * (That a browser has `DeviceMotionEvent.requestPermission` says nothing: Chrome on Android
 * has it too, and reports motion without being asked.)
 */
export function motionUnasked(vendor: string): boolean {
	return !/apple/i.test(vendor);
}

/**
 * The sign of the gravity a browser reports. The specification has an upright phone at
 * y = +9.8 and so have Chrome and Firefox; WebKit reports the opposite.
 */
export function gravitySign(vendor: string): 1 | -1 {
	return /apple/i.test(vendor) ? -1 : 1;
}
