import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { Dimensions } from '../Dimension';
import { logicalTop, scalePosition, teleportationScale } from './scale';

const { Overworld, Nether, TheEnd } = Dimensions;

describe('teleportationScale', () => {
    it("is Java's from.coordinateScale / to.coordinateScale: 8 into the Nether, 1/8 out, 1 to the End", () => {
        // DimensionTypes: Overworld coordinateScale 1.0, Nether 8.0, End 1.0.
        expect(teleportationScale(Overworld, Nether)).toBe(1 / 8);
        expect(teleportationScale(Nether, Overworld)).toBe(8);
        expect(teleportationScale(Overworld, TheEnd)).toBe(1);
    });
});

describe('scalePosition', () => {
    it('divides x and z by 8 into the Nether and floors toward negative infinity', () => {
        // The wiki's floor example: -29.9 / 8 is -3.7375, which is -4 and not -3.
        const scaled = scalePosition(Overworld, Nether, new Vector3(-29.9, 64, 17));
        expect([scaled.getX(), scaled.getZ()]).toEqual([-4, 2]);
    });

    it('multiplies by 8 out of the Nether', () => {
        const scaled = scalePosition(Nether, Overworld, new Vector3(-4, 64, 2.5));
        expect([scaled.getX(), scaled.getZ()]).toEqual([-32, 20]);
    });

    it("clamps y into the Nether's 0..127, which is minY + logicalHeight - 1", () => {
        // Nether `min_y` 0, `logical_height` 128.
        expect(logicalTop(Nether)).toBe(127);
        expect(scalePosition(Overworld, Nether, new Vector3(0, 200, 0)).getY()).toBe(127);
        expect(scalePosition(Overworld, Nether, new Vector3(0, -30, 0)).getY()).toBe(0);
        expect(scalePosition(Overworld, Nether, new Vector3(0, 64.7, 0)).getY()).toBe(64);
    });

    it("clamps y into the Overworld's -64..319", () => {
        // Overworld `min_y` -64, `logical_height` 384.
        expect(logicalTop(Overworld)).toBe(319);
        expect(scalePosition(Nether, Overworld, new Vector3(0, 400, 0)).getY()).toBe(319);
        expect(scalePosition(Nether, Overworld, new Vector3(0, -100, 0)).getY()).toBe(-64);
        expect(scalePosition(Nether, Overworld, new Vector3(0, 5, 0)).getY()).toBe(5);
    });

    it('keeps x and z between dimensions of the same scale', () => {
        const scaled = scalePosition(Overworld, TheEnd, new Vector3(100.5, 49, 0.5));
        expect([scaled.getX(), scaled.getY(), scaled.getZ()]).toEqual([100, 49, 0]);
    });
});
