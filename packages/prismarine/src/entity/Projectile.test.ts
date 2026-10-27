import { describe, expect, it } from 'vitest';

import { drawPower, lookVector } from './Archery';

describe('drawing a bow', () => {
    it('is worth nothing at all when barely pulled', () => {
        expect(drawPower(1)).toBeLessThan(0.2);
    });

    it('reaches full power after a second', () => {
        expect(drawPower(20)).toBe(1);
    });

    it('never goes past full, however long it is held', () => {
        expect(drawPower(200)).toBe(1);
    });

    it('is worth far more at the end of the draw than at the start', () => {
        // Vanilla's curve rather than a straight fraction of the time: the last few ticks are
        // what make a full draw worth waiting for.
        const firstHalf = drawPower(10) - drawPower(0);
        const secondHalf = drawPower(20) - drawPower(10);

        expect(secondHalf).toBeGreaterThan(firstHalf);
    });

    it('aims where the shooter is looking, using Minecraft’s own angles', () => {
        // Yaw runs clockwise from south, so due south is +z and due west is -x. Getting the
        // sign wrong sends every arrow off at ninety degrees to where the player aimed.
        const south = lookVector(0, 0);
        expect(south.getZ()).toBeCloseTo(1);
        expect(south.getX()).toBeCloseTo(0);

        const west = lookVector(90, 0);
        expect(west.getX()).toBeCloseTo(-1);

        const down = lookVector(0, 90);
        expect(down.getY()).toBeCloseTo(-1);
    });
});
