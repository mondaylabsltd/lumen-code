import { describe, expect, it } from 'vitest';
import { gravitySign, motionUnasked, quarterFrom, quarterOfCode } from './tilt';

describe('how the phone is held', () => {
	it('upright', () => {
		expect(quarterFrom(0.02, 0.98, 1)).toBe(0);
	});
	it('on its side: the right edge up, or the left', () => {
		expect(quarterFrom(0.97, 0.1, 0)).toBe(1);
		expect(quarterFrom(-0.97, -0.1, 0)).toBe(-1);
	});
	it('flat, upside down or in between: as it was', () => {
		expect(quarterFrom(0.05, 0.05, 1)).toBe(1); // flat on a table
		expect(quarterFrom(0.6, 0.6, 0)).toBe(0); // halfway
		expect(quarterFrom(0.6, 0.6, -1)).toBe(-1);
		expect(quarterFrom(0, -0.98, 1)).toBe(1); // upside down
	});
});

describe('how the phone is held, from the code in the picture', () => {
	// a code 400 wide and 200 high, as a phone sees it
	const upright = [
		[100, 300],
		[500, 300],
		[500, 500],
		[100, 500]
	];
	// the picture of a phone turned a quarter anticlockwise (its right edge up): the scene
	// appears turned a quarter clockwise, (x, y) -> (600 - y, x)
	const clockwise = upright.map(([x, y]) => [600 - y, x]);
	const anticlockwise = upright.map(([x, y]) => [y, 600 - x]);
	const upsideDown = upright.map(([x, y]) => [600 - x, 800 - y]);
	it('upright', () => {
		expect(quarterOfCode(upright, 1)).toBe(0);
	});
	it('on its side, either way: the same turn as gravity gives', () => {
		expect(quarterOfCode(clockwise, 0)).toBe(1);
		expect(quarterOfCode(anticlockwise, 0)).toBe(-1);
	});
	it('upside down or askew: as it was', () => {
		expect(quarterOfCode(upsideDown, 1)).toBe(1);
		const askew = upright.map(([x, y]) => [x + y * 0.7, y + x * 0.7]);
		expect(quarterOfCode(askew, -1)).toBe(-1);
	});
});

describe('which browsers report motion unasked', () => {
	it('Chrome and Firefox on Android', () => {
		expect(motionUnasked('Google Inc.')).toBe(true);
		expect(motionUnasked('')).toBe(true);
	});
	it('never WebKit, whatever it comes to offer', () => {
		expect(motionUnasked('Apple Computer, Inc.')).toBe(false);
	});
});

describe('the sign of reported gravity', () => {
	it('as specified, except in WebKit', () => {
		expect(gravitySign('Google Inc.')).toBe(1);
		expect(gravitySign('Apple Computer, Inc.')).toBe(-1);
	});
});
