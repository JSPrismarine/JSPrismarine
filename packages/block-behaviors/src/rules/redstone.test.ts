import { describe, expect, it } from 'vitest';

import { createVoxelWorld } from '../voxelWorld';
import { incomingPower, isPowered, MAX_POWER, weightedPlateSignal, wireSignal } from './redstone';

const center = { x: 0, y: 0, z: 0 };

describe('incomingPower', () => {
    it('takes the strongest of the position and its six faces', () => {
        const world = createVoxelWorld().overworld;
        world.setPower({ x: 1, y: 0, z: 0 }, 9);
        world.setPower({ x: 0, y: -1, z: 0 }, 12);

        expect(incomingPower(world, center)).toBe(12);
        expect(isPowered(world, center)).toBe(true);
        expect(isPowered(world, { x: 8, y: 8, z: 8 })).toBe(false);
    });
});

describe('wireSignal', () => {
    it('is one less than a neighboring wire, so a run fades over fifteen blocks', () => {
        const world = createVoxelWorld().overworld;
        world.set(center, 'minecraft:redstone_wire', { redstone_signal: 0 });
        world.set({ x: 1, y: 0, z: 0 }, 'minecraft:redstone_wire', { redstone_signal: 9 });

        expect(wireSignal(world, world.block(center))).toBe(8);
    });

    it('takes a source at full strength from its own position', () => {
        const world = createVoxelWorld().overworld;
        world.set(center, 'minecraft:redstone_wire', { redstone_signal: 0 });
        world.setPower(center, MAX_POWER);

        expect(wireSignal(world, world.block(center))).toBe(MAX_POWER);
    });

    it('never falls below zero', () => {
        const world = createVoxelWorld().overworld;
        world.set(center, 'minecraft:redstone_wire', { redstone_signal: 0 });

        expect(wireSignal(world, world.block(center))).toBe(0);
    });
});

describe('weightedPlateSignal', () => {
    it('counts one per entity on the light plate and one per ten on the heavy one', () => {
        expect(weightedPlateSignal(3, 1)).toBe(3);
        expect(weightedPlateSignal(3, 10)).toBe(1);
        expect(weightedPlateSignal(0, 1)).toBe(0);
        expect(weightedPlateSignal(400, 10)).toBe(MAX_POWER);
    });
});
