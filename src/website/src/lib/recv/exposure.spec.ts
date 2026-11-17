import { describe, expect, it } from 'vitest';
import { chromaSiting, mayHoldExposure } from './exposure';

// camera capabilities as the browsers reported them on 2026-11-17
const s22 = {
	exposureMode: ['continuous', 'manual'],
	exposureTime: { max: 2067.7776, min: 0.4166, step: 0.1 },
	iso: { max: 3200, min: 50, step: 1 },
	frameRate: { max: 30, min: 0 }
};
const iphone = {
	facingMode: ['environment'],
	frameRate: { max: 60, min: 1 },
	torch: true,
	whiteBalanceMode: ['manual', 'continuous'],
	zoom: { max: 10, min: 0.5 }
};
const GOOGLE = 'Google Inc.';
const APPLE = 'Apple Computer, Inc.';

describe('who may hold the exposure', () => {
	it('Chrome on Android, with a camera that offers it', () => {
		expect(mayHoldExposure(s22, GOOGLE)).toBe(true);
	});
	it('not Safari as it is', () => {
		expect(mayHoldExposure(iphone, APPLE)).toBe(false);
	});
	it('not Safari, nor any browser on iOS, should its camera offer it one day', () => {
		expect(mayHoldExposure({ ...iphone, ...s22 }, APPLE)).toBe(false);
	});
	it('not a camera without a manual mode or without a time to set', () => {
		expect(mayHoldExposure({ ...s22, exposureMode: ['continuous'] }, GOOGLE)).toBe(false);
		expect(mayHoldExposure({ exposureMode: ['manual'] }, GOOGLE)).toBe(false);
		expect(mayHoldExposure({ ...s22, exposureTime: { min: 20, max: 20 } }, GOOGLE)).toBe(false);
		expect(mayHoldExposure(null, GOOGLE)).toBe(false);
	});
});

describe('where the chroma samples lie', () => {
	it('level with the even columns in WebKit, as measured on an iPhone', () => {
		expect(chromaSiting(APPLE)).toBe('left');
	});
	it('centred elsewhere, as measured in Chrome on Android', () => {
		expect(chromaSiting(GOOGLE)).toBe('centre');
		expect(chromaSiting('')).toBe('centre');
	});
});
