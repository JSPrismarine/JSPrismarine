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

    it('takes nothing from a wire straight above or below it', () => {
        const world = createVoxelWorld().overworld;
        world.set(center, 'minecraft:redstone_wire', { redstone_signal: 0 });
        world.set({ x: 0, y: 1, z: 0 }, 'minecraft:redstone_wire', { redstone_signal: 9 });
        world.set({ x: 0, y: -1, z: 0 }, 'minecraft:redstone_wire', { redstone_signal: 9 });

        expect(wireSignal(world, world.block(center))).toBe(0);
    });

    it('steps up onto a wire on top of a conductor beside it, unless a conductor covers it', () => {
        const world = createVoxelWorld().overworld;
        world.set(center, 'minecraft:redstone_wire', { redstone_signal: 0 });
        world.setRedstoneConductor({ x: 1, y: 0, z: 0 });
        world.set({ x: 1, y: 1, z: 0 }, 'minecraft:redstone_wire', { redstone_signal: 9 });

        expect(wireSignal(world, world.block(center))).toBe(8);

        world.setRedstoneConductor({ x: 0, y: 1, z: 0 });
        expect(wireSignal(world, world.block(center))).toBe(0);
    });

    it('steps down to a wire below a block beside it that does not conduct', () => {
        const world = createVoxelWorld().overworld;
        world.set(center, 'minecraft:redstone_wire', { redstone_signal: 0 });
        world.set({ x: 1, y: -1, z: 0 }, 'minecraft:redstone_wire', { redstone_signal: 9 });

        expect(wireSignal(world, world.block(center))).toBe(8);

        world.setRedstoneConductor({ x: 1, y: 0, z: 0 });
        expect(wireSignal(world, world.block(center))).toBe(0);
    });

    it('reads the power that leaves wires out, so two wires cannot hold each other lit', () => {
        const world = createVoxelWorld().overworld;
        world.set(center, 'minecraft:redstone_wire', { redstone_signal: 15 });
        world.set({ x: 1, y: 0, z: 0 }, 'minecraft:redstone_wire', { redstone_signal: 15 });
        // What the whole power reading says once each wire counts the other at full strength.
        world.setPower(center, MAX_POWER);
        world.setPowerToWire(center, 0);

        expect(wireSignal(world, world.block(center))).toBe(14);
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
