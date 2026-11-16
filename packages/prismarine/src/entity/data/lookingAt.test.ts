import { describe, expect, it } from 'vitest';

import { isLookingAt, viewVector } from './lookingAt';

const clear = () => true;

describe('isLookingAt', () => {
    it("points a yaw of 0 south and a pitch of 90 straight down, as Java's view vector does", () => {
        expect(viewVector({ yaw: 0, pitch: 0 }).z).toBeCloseTo(1);
        expect(viewVector({ yaw: 90, pitch: 0 }).x).toBeCloseTo(-1);
        expect(viewVector({ yaw: 0, pitch: 90 }).y).toBeCloseTo(-1);
    });

    it("counts the creaking's 0.5 tolerance as a 60 degree cone around the look", () => {
        const base = { eye: { x: 0, y: 1.62, z: 0 }, heights: [1.62], tolerance: 0.5, scaleByDistance: false, clear };
        expect(isLookingAt({ ...base, look: { yaw: 0, pitch: 0 }, at: { x: 0, y: 0, z: 8 } })).toBe(true);
        expect(isLookingAt({ ...base, look: { yaw: 55, pitch: 0 }, at: { x: 0, y: 0, z: 8 } })).toBe(true);
        expect(isLookingAt({ ...base, look: { yaw: 65, pitch: 0 }, at: { x: 0, y: 0, z: 8 } })).toBe(false);
        expect(isLookingAt({ ...base, look: { yaw: 0, pitch: 0 }, at: { x: 0, y: 0, z: 8 }, clear: () => false })).toBe(
            false
        );
    });

    it("narrows the enderman's 0.025 tolerance with distance", () => {
        const base = { eye: { x: 0, y: 1.62, z: 0 }, heights: [1.62], tolerance: 0.025, scaleByDistance: true, clear };
        // A 5 degree miss: within the tolerance at 2 blocks, outside it at 10.
        expect(isLookingAt({ ...base, look: { yaw: 5, pitch: 0 }, at: { x: 0, y: 0, z: 2 } })).toBe(true);
        expect(isLookingAt({ ...base, look: { yaw: 5, pitch: 0 }, at: { x: 0, y: 0, z: 10 } })).toBe(false);
    });
});
