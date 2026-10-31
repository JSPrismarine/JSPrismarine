import { describe, expect, it } from 'vitest';

import { AIR } from '../identifiers';
import { bindFamily } from '../harness';
import { doorFamily, doorHinge, fenceGateFamily, trapdoorFamily } from './openable';
import { createVoxelWorld } from '../voxelWorld';

const lower = { x: 0, y: 1, z: 0 };
const upper = { x: 0, y: 2, z: 0 };

const doorStates = (states: Record<string, string | number | boolean> = {}) => ({
    'minecraft:cardinal_direction': 'south',
    door_hinge_bit: false,
    open_bit: false,
    upper_block_bit: false,
    ...states
});

const doorHarness = (identifier = 'minecraft:wooden_door') => {
    const harness = bindFamily(doorFamily, identifier);
    harness.dimension.set({ x: 0, y: 0, z: 0 }, 'minecraft:stone');
    harness.dimension.set(lower, identifier, doorStates());
    return harness;
};

describe('doorHinge', () => {
    it('is on the right with nothing beside the door', () => {
        const world = createVoxelWorld().overworld;
        world.set(lower, 'minecraft:wooden_door', doorStates());

        expect(doorHinge(world, world.block(lower), 'south')).toBe(false);
    });

    it('moves to the left when a solid block stands on that side', () => {
        const world = createVoxelWorld().overworld;
        world.set(lower, 'minecraft:wooden_door', doorStates());
        // Facing south, the left side is east.
        world.set({ x: 1, y: 1, z: 0 }, 'minecraft:stone');

        expect(doorHinge(world, world.block(lower), 'south')).toBe(true);
    });

    it('takes the other hinge from the door already beside it, so the two open as a pair', () => {
        const world = createVoxelWorld().overworld;
        world.set(lower, 'minecraft:wooden_door', doorStates());
        world.set({ x: 1, y: 1, z: 0 }, 'minecraft:wooden_door', doorStates({ door_hinge_bit: false }));

        expect(doorHinge(world, world.block(lower), 'south')).toBe(true);
    });
});

describe('doorFamily', () => {
    it('places the upper half with the same facing and hinge', () => {
        const harness = doorHarness();

        // The placer stands north of the door looking south, which the mapping stores as
        // Bedrock `west`; see the placement test below for the convention.
        harness.place(lower, { placedBy: { identifier: 'minecraft:player', position: { x: 0, y: 1, z: -4 } } });

        expect(harness.dimension.identifierAt(upper)).toBe('minecraft:wooden_door');
        expect(harness.dimension.stateAt(upper, 'upper_block_bit')).toBe(true);
        expect(harness.dimension.stateAt(upper, 'minecraft:cardinal_direction')).toBe('west');
        expect(harness.dimension.stateAt(lower, 'minecraft:cardinal_direction')).toBe('west');
    });

    it('stores the cardinal a quarter turn clockwise of the look direction', () => {
        // Java's `DoorBlock.getStateForPlacement` keeps the placer's horizontal direction
        // unopposed, and the Geyser-derived table turns a door's Java `facing` a quarter turn
        // clockwise into Bedrock's `minecraft:cardinal_direction`: Java `north` is Bedrock
        // `east`. Writing the look direction unrotated left every placed door a quarter turn
        // off vanilla.
        const placements = [
            { yaw: 180, stored: 'east' }, // looking north
            { yaw: 270, stored: 'south' }, // looking east
            { yaw: 0, stored: 'west' }, // looking south
            { yaw: 90, stored: 'north' } // looking west
        ] as const;

        for (const { yaw, stored } of placements) {
            const harness = doorHarness();

            harness.place(lower, {
                placedBy: { identifier: 'minecraft:player', position: { x: 0, y: 1, z: 0 }, yaw }
            });

            expect(harness.dimension.stateAt(lower, 'minecraft:cardinal_direction')).toBe(stored);
            expect(harness.dimension.stateAt(upper, 'minecraft:cardinal_direction')).toBe(stored);
        }
    });

    it('toggles both halves on interact', () => {
        const harness = doorHarness();
        harness.dimension.set(upper, 'minecraft:wooden_door', doorStates({ upper_block_bit: true }));

        expect(harness.interact(lower)).toBe(true);
        expect(harness.dimension.stateAt(lower, 'open_bit')).toBe(true);
        expect(harness.dimension.stateAt(upper, 'open_bit')).toBe(true);

        harness.interact(lower);

        expect(harness.dimension.stateAt(lower, 'open_bit')).toBe(false);
        expect(harness.dimension.stateAt(upper, 'open_bit')).toBe(false);
    });

    it('refuses a bare hand on an iron door but follows redstone', () => {
        const harness = doorHarness('minecraft:iron_door');
        harness.dimension.set(upper, 'minecraft:iron_door', doorStates({ upper_block_bit: true }));

        expect(harness.interact(lower)).toBeUndefined();
        expect(harness.dimension.stateAt(lower, 'open_bit')).toBe(false);

        harness.redstone(lower, 15);

        expect(harness.dimension.stateAt(lower, 'open_bit')).toBe(true);
        expect(harness.dimension.stateAt(upper, 'open_bit')).toBe(true);
    });

    it('pops when its other half goes', () => {
        const harness = doorHarness();

        harness.neighborChanged(lower, 'up');

        expect(harness.dimension.identifierAt(lower)).toBe(AIR);
    });

    it('pops when the block under it goes', () => {
        const harness = doorHarness();
        harness.dimension.set(upper, 'minecraft:wooden_door', doorStates({ upper_block_bit: true }));
        harness.dimension.set({ x: 0, y: 0, z: 0 }, AIR);

        harness.neighborChanged(lower, 'down');

        expect(harness.dimension.identifierAt(lower)).toBe(AIR);
    });

    it('takes the other half with it when it breaks, and drops one door', () => {
        const harness = doorHarness();
        harness.dimension.set(upper, 'minecraft:wooden_door', doorStates({ upper_block_bit: true }));

        harness.breakBlock(lower);

        expect(harness.dimension.identifierAt(upper)).toBe(AIR);
        expect(harness.dimension.drops.map((entry) => entry.drop.count)).toEqual([1]);
    });
});

const trapdoorStates = (states: Record<string, string | number | boolean> = {}) => ({
    direction: 0,
    open_bit: false,
    upside_down_bit: false,
    ...states
});

const trapdoorHarness = () => {
    const harness = bindFamily(trapdoorFamily, 'minecraft:trapdoor');
    harness.dimension.set(lower, 'minecraft:trapdoor', trapdoorStates());
    return harness;
};

describe('trapdoorFamily', () => {
    it('hangs a placed trapdoor on the clicked side face', () => {
        // Java's `TrapDoorBlock.getStateForPlacement` takes the clicked face itself
        // for a click on a side, and the Geyser-derived table spells that Java
        // `facing` in the numeric `direction` on the weirdo order: east 0, west 1,
        // south 2, north 3.
        const harness = trapdoorHarness();

        harness.place(lower, {
            placedBy: { identifier: 'minecraft:player', position: { x: 0, y: 1, z: 4 }, yaw: 180 },
            face: 'north',
            faceLocation: { x: 0.5, y: 0.25, z: 0.5 }
        });

        expect(harness.dimension.stateAt(lower, 'direction')).toBe(3);
        expect(harness.dimension.stateAt(lower, 'upside_down_bit')).toBe(false);
    });

    it('takes the top half from a click in the upper half of a side face', () => {
        const harness = trapdoorHarness();

        harness.place(lower, {
            placedBy: { identifier: 'minecraft:player', position: { x: 0, y: 1, z: 4 }, yaw: 180 },
            face: 'west',
            faceLocation: { x: 0.5, y: 0.75, z: 0.5 }
        });

        expect(harness.dimension.stateAt(lower, 'direction')).toBe(1);
        expect(harness.dimension.stateAt(lower, 'upside_down_bit')).toBe(true);
    });

    it('opposes the look direction for a click on the top of a block', () => {
        // Java's vertical-click branch opposes the placer's horizontal direction,
        // and a click on a top face takes the bottom half.
        const placements = [
            { yaw: 180, direction: 2 }, // looking north, facing south
            { yaw: 270, direction: 1 }, // looking east, facing west
            { yaw: 0, direction: 3 }, // looking south, facing north
            { yaw: 90, direction: 0 } // looking west, facing east
        ] as const;

        for (const { yaw, direction } of placements) {
            const harness = trapdoorHarness();

            harness.place(lower, {
                placedBy: { identifier: 'minecraft:player', position: { x: 0, y: 1, z: 0 }, yaw },
                face: 'up'
            });

            expect(harness.dimension.stateAt(lower, 'direction')).toBe(direction);
            expect(harness.dimension.stateAt(lower, 'upside_down_bit')).toBe(false);
        }
    });

    it('takes the top half from a click on the underside of a block', () => {
        const harness = trapdoorHarness();

        harness.place(lower, {
            placedBy: { identifier: 'minecraft:player', position: { x: 0, y: 1, z: -4 }, yaw: 0 },
            face: 'down'
        });

        expect(harness.dimension.stateAt(lower, 'direction')).toBe(3);
        expect(harness.dimension.stateAt(lower, 'upside_down_bit')).toBe(true);
    });

    it('leaves a placement the world performed on its palette state', () => {
        const harness = trapdoorHarness();
        harness.dimension.set(lower, 'minecraft:trapdoor', trapdoorStates({ direction: 2 }));

        harness.place(lower, { placedBy: undefined });

        expect(harness.dimension.stateAt(lower, 'direction')).toBe(2);
        expect(harness.dimension.stateAt(lower, 'upside_down_bit')).toBe(false);
    });

    it('toggles on interact and follows redstone, and refuses a hand on the iron one', () => {
        const wooden = bindFamily(trapdoorFamily, 'minecraft:trapdoor');
        wooden.dimension.set(lower, 'minecraft:trapdoor', { open_bit: false, direction: 0, upside_down_bit: false });

        expect(wooden.interact(lower)).toBe(true);
        expect(wooden.dimension.stateAt(lower, 'open_bit')).toBe(true);

        const iron = bindFamily(trapdoorFamily, 'minecraft:iron_trapdoor');
        iron.dimension.set(lower, 'minecraft:iron_trapdoor', { open_bit: false, direction: 0, upside_down_bit: false });

        expect(iron.interact(lower)).toBeUndefined();

        iron.redstone(lower, 9);

        expect(iron.dimension.stateAt(lower, 'open_bit')).toBe(true);
    });
});

describe('fenceGateFamily', () => {
    it('opens on interact and lowers into a wall beside it', () => {
        const harness = bindFamily(fenceGateFamily, 'minecraft:fence_gate');
        harness.dimension.set(lower, 'minecraft:fence_gate', {
            open_bit: false,
            in_wall_bit: false,
            'minecraft:cardinal_direction': 'south'
        });

        expect(harness.interact(lower)).toBe(true);
        expect(harness.dimension.stateAt(lower, 'open_bit')).toBe(true);

        harness.dimension.set({ x: 1, y: 1, z: 0 }, 'minecraft:cobblestone_wall');
        harness.neighborChanged(lower, 'east');

        expect(harness.dimension.stateAt(lower, 'in_wall_bit')).toBe(true);
    });
});
