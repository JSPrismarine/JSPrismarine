import type { HookBlock } from '@jsprismarine/blocks';
import { describe, expect, it } from 'vitest';

import { bareName, hasState, patchStates, setStates, sibling, stateBoolean, stateNumber, stateString } from './state';
import { createVoxelWorld } from './voxelWorld';

const block = (states: HookBlock['states']): HookBlock => ({
    identifier: 'minecraft:oak_door',
    position: { x: 0, y: 0, z: 0 },
    dimension: 'minecraft:overworld',
    states
});

describe('stateNumber', () => {
    it('reads a boolean as 0 and 1, which is how the wire carries one', () => {
        expect(stateNumber(block({ open_bit: true }), 'open_bit')).toBe(1);
        expect(stateNumber(block({ open_bit: false }), 'open_bit')).toBe(0);
    });

    it('reads a numeric string and falls back for a non-numeric one', () => {
        expect(stateNumber(block({ growth: '3' }), 'growth')).toBe(3);
        expect(stateNumber(block({ growth: 'ripe' }), 'growth', 7)).toBe(7);
    });

    it('falls back for a state the block does not carry', () => {
        expect(stateNumber(block({}), 'growth', 2)).toBe(2);
    });
});

describe('stateBoolean', () => {
    it('counts any nonzero number as true', () => {
        expect(stateBoolean(block({ open_bit: 1 }), 'open_bit')).toBe(true);
        expect(stateBoolean(block({ open_bit: 0 }), 'open_bit')).toBe(false);
        expect(stateBoolean(block({}), 'open_bit', true)).toBe(true);
    });
});

describe('stateString', () => {
    it('prints a number and falls back for an absent state', () => {
        expect(stateString(block({ pillar_axis: 'y' }), 'pillar_axis')).toBe('y');
        expect(stateString(block({ growth: 3 }), 'growth')).toBe('3');
        expect(stateString(block({}), 'pillar_axis', 'y')).toBe('y');
    });
});

describe('patchStates', () => {
    it('keeps the states the patch leaves out and drops undefined entries', () => {
        expect(
            patchStates(block({ open_bit: false, direction: 2 }), { open_bit: true, door_hinge_bit: undefined })
        ).toEqual({
            open_bit: true,
            direction: 2
        });
    });
});

describe('setStates', () => {
    it('rewrites the block in place, keeping its identifier', () => {
        const world = createVoxelWorld().overworld;
        world.set({ x: 1, y: 1, z: 1 }, 'minecraft:oak_door', { open_bit: false, direction: 1 });

        setStates(world, world.block({ x: 1, y: 1, z: 1 }), { open_bit: true });

        expect(world.identifierAt({ x: 1, y: 1, z: 1 })).toBe('minecraft:oak_door');
        expect(world.stateAt({ x: 1, y: 1, z: 1 }, 'open_bit')).toBe(true);
        expect(world.stateAt({ x: 1, y: 1, z: 1 }, 'direction')).toBe(1);
    });
});

describe('identifiers', () => {
    it('splits and rejoins a namespaced identifier', () => {
        expect(bareName('minecraft:oak_door')).toBe('oak_door');
        expect(sibling('plugin:oak_door', 'oak_trapdoor')).toBe('plugin:oak_trapdoor');
        expect(sibling('oak_door', 'oak_trapdoor')).toBe('minecraft:oak_trapdoor');
    });

    it('tells a carried state from an absent one', () => {
        expect(hasState(block({ open_bit: false }), 'open_bit')).toBe(true);
        expect(hasState(block({}), 'open_bit')).toBe(false);
    });
});
