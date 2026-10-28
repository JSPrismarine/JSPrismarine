import type { BlockFace, BlockPlaceEvent, FaceLocation, HookBlock } from '@jsprismarine/blocks';
import { describe, expect, it } from 'vitest';

import { placedHalf, placementAxis, placementFacing } from './placement';

const block: HookBlock = {
    identifier: 'minecraft:oak_log',
    position: { x: 0, y: 0, z: 0 },
    dimension: 'minecraft:overworld',
    states: { pillar_axis: 'y' }
};

const placement = (
    options: {
        readonly face?: BlockFace;
        readonly faceLocation?: FaceLocation;
        readonly placerAt?: { x: number; y: number; z: number };
        readonly yaw?: number;
    } = {}
): BlockPlaceEvent => ({
    block,
    previous: undefined,
    placedBy:
        options.placerAt === undefined
            ? undefined
            : {
                  identifier: 'minecraft:player',
                  position: options.placerAt,
                  ...(options.yaw === undefined ? {} : { yaw: options.yaw })
              },
    itemStack: undefined,
    face: options.face,
    faceLocation: options.faceLocation
});

describe('placementAxis', () => {
    it('reads the axis off the clicked face', () => {
        expect(placementAxis(placement({ face: 'up' }))).toBe('y');
        expect(placementAxis(placement({ face: 'down' }))).toBe('y');
        expect(placementAxis(placement({ face: 'west' }))).toBe('x');
        expect(placementAxis(placement({ face: 'south' }))).toBe('z');
    });

    it('falls back to the placer and gives up when there is neither', () => {
        expect(placementAxis(placement({ placerAt: { x: 0, y: 0, z: -4 } }))).toBe('z');
        expect(placementAxis(placement())).toBeUndefined();
    });

    it('prefers the face over the placer, which is the whole point of carrying it', () => {
        expect(placementAxis(placement({ face: 'up', placerAt: { x: -4, y: 0, z: 0 } }))).toBe('y');
    });
});

describe('placedHalf', () => {
    it('takes the top from the underside and the bottom from the top face', () => {
        expect(placedHalf(placement({ face: 'down' }))).toBe('top');
        expect(placedHalf(placement({ face: 'up' }))).toBe('bottom');
    });

    it('splits a side face at its middle', () => {
        expect(placedHalf(placement({ face: 'east', faceLocation: { x: 0, y: 0.51, z: 0.5 } }))).toBe('top');
        expect(placedHalf(placement({ face: 'east', faceLocation: { x: 0, y: 0.5, z: 0.5 } }))).toBe('bottom');
        expect(placedHalf(placement({ face: 'east', faceLocation: { x: 0, y: 0, z: 0.5 } }))).toBe('bottom');
    });

    it('gives up without a face, and without a location on a side face', () => {
        expect(placedHalf(placement())).toBeUndefined();
        expect(placedHalf(placement({ face: 'north' }))).toBeUndefined();
    });
});

describe('placementFacing', () => {
    it('is where the placer looked, not which face was clicked', () => {
        expect(placementFacing(placement({ face: 'up', placerAt: { x: 0, y: 0, z: 4 } }))).toBe('north');
        expect(placementFacing(placement({ face: 'up' }))).toBeUndefined();
    });

    it('uses the player rotation when it disagrees with their position', () => {
        expect(placementFacing(placement({ placerAt: { x: -4, y: 0, z: 0 }, yaw: 90, face: 'up' }))).toBe('west');
    });
});
