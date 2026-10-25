import { BLOCK_FACES, vanillaBlockPalette } from '@jsprismarine/blocks';
import { describe, expect, it } from 'vitest';

import {
    axisOfFace,
    CARDINAL_DIRECTIONS,
    faceOfFacingDirection,
    facingDirectionOf,
    facingFrom,
    offset,
    opposite,
    rotateClockwise,
    rotateCounterClockwise
} from './geometry';

describe('offset', () => {
    it('steps one block along each face', () => {
        const origin = { x: 0, y: 0, z: 0 };

        expect(BLOCK_FACES.map((face) => offset(origin, face))).toEqual([
            { x: 0, y: -1, z: 0 },
            { x: 0, y: 1, z: 0 },
            { x: 0, y: 0, z: -1 },
            { x: 0, y: 0, z: 1 },
            { x: -1, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 }
        ]);
    });

    it('steps backwards for a negative distance', () => {
        expect(offset({ x: 0, y: 4, z: 0 }, 'up', -3)).toEqual({ x: 0, y: 1, z: 0 });
    });
});

describe('opposite', () => {
    it('is its own inverse for every face', () => {
        for (const face of BLOCK_FACES) expect(opposite(opposite(face))).toBe(face);
    });
});

describe('rotateClockwise', () => {
    it('returns to the start after four turns', () => {
        for (const face of BLOCK_FACES) {
            expect(rotateClockwise(rotateClockwise(rotateClockwise(rotateClockwise(face))))).toBe(face);
        }
    });

    it('leaves the vertical faces alone', () => {
        expect(rotateClockwise('up')).toBe('up');
        expect(rotateCounterClockwise('down')).toBe('down');
    });
});

describe('facing_direction', () => {
    it('agrees with the face order in both directions', () => {
        for (const face of BLOCK_FACES) expect(faceOfFacingDirection(facingDirectionOf(face))).toBe(face);
    });

    it('has no face outside the domain', () => {
        expect(faceOfFacingDirection(6)).toBeUndefined();
    });
});

describe('CARDINAL_DIRECTIONS', () => {
    it('is the domain the captured palette declares for the trait state', () => {
        const palette = vanillaBlockPalette();
        const declared = palette.entries
            .flatMap((entry) => entry.model.states)
            .find((state) => state.name === 'minecraft:cardinal_direction');

        expect(declared?.values).toEqual([...CARDINAL_DIRECTIONS]);
    });
});

describe('facingFrom', () => {
    it('takes the larger horizontal offset', () => {
        expect(facingFrom({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 1 })).toBe('east');
        expect(facingFrom({ x: 0, y: 0, z: 0 }, { x: -5, y: 0, z: 1 })).toBe('west');
        expect(facingFrom({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 5 })).toBe('south');
        expect(facingFrom({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: -5 })).toBe('north');
    });
});

describe('axisOfFace', () => {
    it('names the axis a pillar takes from the clicked face', () => {
        expect(axisOfFace('up')).toBe('y');
        expect(axisOfFace('east')).toBe('x');
        expect(axisOfFace('north')).toBe('z');
    });
});
