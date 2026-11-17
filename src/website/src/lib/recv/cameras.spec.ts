import { describe, expect, it } from 'vitest';
import { mainCameras } from './cameras';

const cam = (label: string, deviceId: string) => ({ kind: 'videoinput', label, deviceId });

describe('the main camera on each side', () => {
	it('Chrome on a Galaxy S22: camera 0 at the back, not the ultra-wide the browser gives', () => {
		// the list as Chrome 157 gave it on 2026-11-17
		const s22 = [
			cam('camera 1, facing front', 'f1'),
			cam('camera 3, facing front', 'f3'),
			cam('camera 2, facing back', 'b2'),
			cam('camera 0, facing back', 'b0')
		];
		expect(mainCameras(s22)).toEqual({ environment: 'b0', user: 'f1' });
	});
	it('the older "camera2 <n>" form of the label', () => {
		const list = [cam('camera2 1, facing front', 'f'), cam('camera2 0, facing back', 'b')];
		expect(mainCameras(list)).toEqual({ environment: 'b', user: 'f' });
	});
	it('names that say nothing (Safari, a desktop, no permission yet): the browser chooses', () => {
		expect(mainCameras([cam('Back Camera', 'a'), cam('Front Camera', 'b')])).toEqual({});
		expect(mainCameras([cam('后置相机', 'a'), cam('前置相机', 'b')])).toEqual({});
		expect(mainCameras([cam('FaceTime HD Camera', 'a')])).toEqual({});
		expect(mainCameras([cam('', ''), cam('', '')])).toEqual({});
	});
	it('other kinds of device are not cameras', () => {
		const mic = { kind: 'audioinput', label: 'camera 0, facing back', deviceId: 'm' };
		expect(mainCameras([mic])).toEqual({});
	});
});
