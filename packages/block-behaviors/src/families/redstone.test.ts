import { describe, expect, it } from 'vitest';

import { bedrockBlockStates } from '@jsprismarine/mapping';

import { facingDirectionOf } from '../geometry';
import { bindFamily, heldItem } from '../harness';
import { AIR } from '../identifiers';
import { MAX_STACK_SIZE } from '../rules/container';
import { BUTTON_PRESS_TICKS, OBSERVER_PULSE_TICKS } from '../rules/redstone';
import {
    buttonFamily,
    comparatorInput,
    pressurePlateFamily,
    railFamily,
    redstoneFamily,
    TNT_FUSE_TICKS
} from './redstone';

const origin = { x: 0, y: 0, z: 0 };
const pistonFacingDirection = (identifier: string) => {
    const facingDirection = bedrockBlockStates(identifier, { facing_direction: 'east' }).facing_direction;
    if (facingDirection === undefined) throw new Error(`No east facing direction for ${identifier}`);
    return facingDirection;
};
const PISTON_EAST = pistonFacingDirection('minecraft:piston');
const STICKY_PISTON_EAST = pistonFacingDirection('minecraft:sticky_piston');

describe('redstoneFamily: tnt', () => {
    it('primes to flint and steel and ignores a bare hand', () => {
        const harness = bindFamily(redstoneFamily, 'minecraft:tnt');
        harness.dimension.set(origin, 'minecraft:tnt', { explode_bit: false });

        expect(harness.interact(origin)).toBeUndefined();
        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:tnt');

        expect(harness.interact(origin, { itemStack: heldItem('minecraft:flint_and_steel') })).toBe(true);

        expect(harness.dimension.identifierAt(origin)).toBe(AIR);
        expect(harness.dimension.entities.map((entity) => entity.identifier)).toEqual(['minecraft:tnt']);
        expect(harness.dimension.entities.at(-1)?.data?.['fuse']).toBe(TNT_FUSE_TICKS);
    });
});

describe('redstoneFamily: pistons', () => {
    it('pushes the run in front and puts its head down', () => {
        const harness = bindFamily(redstoneFamily, 'minecraft:piston');
        harness.dimension.set(origin, 'minecraft:piston', { facing_direction: PISTON_EAST });
        harness.dimension.set({ x: 1, y: 0, z: 0 }, 'minecraft:stone');

        harness.redstone(origin, 15);

        expect(harness.dimension.identifierAt({ x: 1, y: 0, z: 0 })).toBe('minecraft:piston_arm_collision');
        expect(harness.dimension.identifierAt({ x: 2, y: 0, z: 0 })).toBe('minecraft:stone');
        expect(harness.dimension.getBlockData(origin)?.pistonArm).toEqual({
            progress: 1,
            lastProgress: 1,
            state: 2,
            newState: 2,
            sticky: false
        });
    });

    it('refuses to push an immovable block and leaves everything in place', () => {
        const harness = bindFamily(redstoneFamily, 'minecraft:piston');
        harness.dimension.defineProperties('minecraft:obsidian', { pushReaction: 'immovable' });
        harness.dimension.set(origin, 'minecraft:piston', { facing_direction: PISTON_EAST });
        harness.dimension.set({ x: 1, y: 0, z: 0 }, 'minecraft:obsidian');

        harness.redstone(origin, 15);

        expect(harness.dimension.identifierAt({ x: 1, y: 0, z: 0 })).toBe('minecraft:obsidian');
    });

    it('pulls the block back when a sticky piston retracts', () => {
        const harness = bindFamily(redstoneFamily, 'minecraft:sticky_piston');
        harness.dimension.set(origin, 'minecraft:sticky_piston', { facing_direction: STICKY_PISTON_EAST });
        harness.dimension.set({ x: 1, y: 0, z: 0 }, 'minecraft:sticky_piston_arm_collision');
        harness.dimension.set({ x: 2, y: 0, z: 0 }, 'minecraft:stone');

        harness.redstone(origin, 0);

        expect(harness.dimension.identifierAt({ x: 1, y: 0, z: 0 })).toBe('minecraft:stone');
        expect(harness.dimension.identifierAt({ x: 2, y: 0, z: 0 })).toBe(AIR);
        expect(harness.dimension.getBlockData(origin)?.pistonArm).toEqual({
            progress: 0,
            lastProgress: 0,
            state: 0,
            newState: 0,
            sticky: true
        });
    });
});

describe('redstoneFamily: the observer', () => {
    it('pulses on the scheduled tick, then clears on the next scheduled tick', () => {
        const harness = bindFamily(redstoneFamily, 'minecraft:observer');
        harness.dimension.set(origin, 'minecraft:observer', {
            'minecraft:facing_direction': 'east',
            powered_bit: false
        });

        harness.neighborChanged(origin, 'east');

        expect(harness.dimension.stateAt(origin, 'powered_bit')).toBe(false);
        expect(harness.dimension.scheduled).toEqual([{ position: origin, delay: OBSERVER_PULSE_TICKS }]);

        harness.tick(origin);

        expect(harness.dimension.stateAt(origin, 'powered_bit')).toBe(true);
        expect(harness.dimension.scheduled).toEqual([
            { position: origin, delay: OBSERVER_PULSE_TICKS },
            { position: origin, delay: OBSERVER_PULSE_TICKS }
        ]);

        harness.tick(origin);

        expect(harness.dimension.stateAt(origin, 'powered_bit')).toBe(false);
        expect(harness.dimension.notified).toContainEqual(origin);
    });

    it('ignores a change behind it', () => {
        const harness = bindFamily(redstoneFamily, 'minecraft:observer');
        harness.dimension.set(origin, 'minecraft:observer', {
            'minecraft:facing_direction': 'east',
            powered_bit: false
        });

        harness.neighborChanged(origin, 'west');

        expect(harness.dimension.stateAt(origin, 'powered_bit')).toBe(false);
    });
});

describe('redstoneFamily: redstone torches', () => {
    it('waits one redstone tick before inverting against a powered support', () => {
        const harness = bindFamily(redstoneFamily, 'minecraft:redstone_torch');
        const support = { x: 0, y: -1, z: 0 };
        harness.dimension.set(origin, 'minecraft:redstone_torch', { torch_facing_direction: 'top' });
        harness.dimension.set(support, 'minecraft:stone');
        harness.dimension.setPower(support, 15);

        harness.place(origin);

        expect(harness.dimension.scheduled).toEqual([{ position: origin, delay: 2 }]);
        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:redstone_torch');

        harness.tick(origin, 2);

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:unlit_redstone_torch');
    });

    it('burns out after eight off transitions in sixty ticks and restarts later', () => {
        const harness = bindFamily(redstoneFamily, 'minecraft:redstone_torch');
        const support = { x: 0, y: -1, z: 0 };
        harness.dimension.set(origin, 'minecraft:redstone_torch', { torch_facing_direction: 'top' });
        harness.dimension.set(support, 'minecraft:stone');
        let tick = 1;

        for (let toggle = 0; toggle < 8; toggle += 1) {
            harness.dimension.setPower(support, 15);
            harness.neighborChanged(origin, 'down');
            harness.tick(origin, tick);
            tick += 1;
            expect(harness.dimension.identifierAt(origin)).toBe('minecraft:unlit_redstone_torch');

            if (toggle === 7) continue;
            harness.dimension.setPower(support, 0);
            harness.neighborChanged(origin, 'down');
            harness.tick(origin, tick);
            tick += 1;
            expect(harness.dimension.identifierAt(origin)).toBe('minecraft:redstone_torch');
        }

        expect(harness.dimension.sounds).toContainEqual({ position: origin, name: 'minecraft:random.fizz' });
        expect(harness.dimension.scheduled.at(-1)).toEqual({ position: origin, delay: 160 });
    });
});

describe('comparatorInput', () => {
    it('reads the fill level of the container behind it', () => {
        const harness = bindFamily(redstoneFamily, 'minecraft:unpowered_comparator');
        harness.dimension.set(origin, 'minecraft:unpowered_comparator', {
            'minecraft:cardinal_direction': 'south',
            output_lit_bit: false,
            output_subtract_bit: false
        });
        // Facing south, the block it reads is to the north.
        const behind = { x: 0, y: 0, z: -1 };
        harness.dimension.set(behind, 'minecraft:chest');
        harness.dimension.setBlockData(behind, {
            capacity: 27,
            items: new Array(27).fill({ identifier: 'minecraft:stone', count: MAX_STACK_SIZE })
        });

        expect(comparatorInput(harness.dimension, harness.block(origin))).toBe(15);
    });

    it('reads a counter state when the block behind has one', () => {
        const harness = bindFamily(redstoneFamily, 'minecraft:unpowered_comparator');
        harness.dimension.set(origin, 'minecraft:unpowered_comparator', {
            'minecraft:cardinal_direction': 'south'
        });
        harness.dimension.set({ x: 0, y: 0, z: -1 }, 'minecraft:composter', { composter_fill_level: 4 });

        expect(comparatorInput(harness.dimension, harness.block(origin))).toBe(4);
    });

    it('lights the comparator on its scheduled tick', () => {
        const harness = bindFamily(redstoneFamily, 'minecraft:unpowered_comparator');
        harness.dimension.set(origin, 'minecraft:unpowered_comparator', {
            'minecraft:cardinal_direction': 'south',
            output_lit_bit: false,
            output_subtract_bit: false
        });
        harness.dimension.set({ x: 0, y: 0, z: -1 }, 'minecraft:composter', { composter_fill_level: 4 });

        harness.tick(origin);

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:powered_comparator');
        expect(harness.dimension.getBlockData(origin)).toEqual({ signal: 4, comparatorOutput: 4 });
    });
});

describe('redstoneFamily: the rest of the components', () => {
    it('toggles a lever and tells its neighbors', () => {
        const harness = bindFamily(redstoneFamily, 'minecraft:lever');
        harness.dimension.set(origin, 'minecraft:lever', { open_bit: false, lever_direction: 'north' });

        expect(harness.interact(origin)).toBe(true);
        expect(harness.dimension.stateAt(origin, 'open_bit')).toBe(true);
        expect(harness.dimension.notified).toContainEqual(origin);
    });

    it('cycles a repeater delay through its four values', () => {
        const harness = bindFamily(redstoneFamily, 'minecraft:unpowered_repeater');
        harness.dimension.set(origin, 'minecraft:unpowered_repeater', {
            repeater_delay: 3,
            'minecraft:cardinal_direction': 'south'
        });

        harness.interact(origin);

        expect(harness.dimension.stateAt(origin, 'repeater_delay')).toBe(0);
    });

    it('swaps a redstone lamp for its lit block', () => {
        const harness = bindFamily(redstoneFamily, 'minecraft:redstone_lamp');
        harness.dimension.set(origin, 'minecraft:redstone_lamp');

        harness.redstone(origin, 15);

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:lit_redstone_lamp');
    });

    it('fades a wire one step per block', () => {
        const harness = bindFamily(redstoneFamily, 'minecraft:redstone_wire');
        harness.dimension.set({ x: 0, y: -1, z: 0 }, 'minecraft:stone');
        harness.dimension.set({ x: 1, y: -1, z: 0 }, 'minecraft:stone');
        harness.dimension.set(origin, 'minecraft:redstone_wire', { redstone_signal: 0 });
        harness.dimension.set({ x: 1, y: 0, z: 0 }, 'minecraft:redstone_wire', { redstone_signal: 12 });

        harness.neighborChanged(origin, 'east');

        expect(harness.dimension.stateAt(origin, 'redstone_signal')).toBe(11);
    });

    it('pops when placed without a solid support', () => {
        const harness = bindFamily(redstoneFamily, 'minecraft:redstone_wire');
        harness.dimension.set(origin, 'minecraft:redstone_wire', { redstone_signal: 0 });

        harness.place(origin);

        expect(harness.dimension.identifierAt(origin)).toBe(AIR);
    });

    it('pops when its support is removed', () => {
        const harness = bindFamily(redstoneFamily, 'minecraft:redstone_wire');
        const support = { x: 0, y: -1, z: 0 };
        harness.dimension.set(support, 'minecraft:stone');
        harness.dimension.set(origin, 'minecraft:redstone_wire', { redstone_signal: 0 });
        harness.place(origin);

        harness.dimension.set(support, AIR);
        harness.neighborChanged(origin, 'down');

        expect(harness.dimension.identifierAt(origin)).toBe(AIR);
    });

    it('turns tnt into a primed entity', () => {
        const harness = bindFamily(redstoneFamily, 'minecraft:tnt');
        harness.dimension.set(origin, 'minecraft:tnt', { explode_bit: false });

        harness.redstone(origin, 15);

        expect(harness.dimension.identifierAt(origin)).toBe(AIR);
        expect(harness.dimension.entities.map((entity) => entity.identifier)).toEqual(['minecraft:tnt']);
    });

    it('debounces a dispenser on the triggered bit', () => {
        const harness = bindFamily(redstoneFamily, 'minecraft:dispenser');
        harness.dimension.set(origin, 'minecraft:dispenser', {
            triggered_bit: false,
            facing_direction: facingDirectionOf('east')
        });

        harness.redstone(origin, 15);
        harness.redstone(origin, 15);

        expect(harness.dimension.stateAt(origin, 'triggered_bit')).toBe(true);
        expect(harness.dimension.sounds).toHaveLength(1);
    });
});

describe('buttonFamily', () => {
    it('presses, schedules the release and lets go on the tick', () => {
        const harness = bindFamily(buttonFamily, 'minecraft:stone_button');
        harness.dimension.set(origin, 'minecraft:stone_button', {
            button_pressed_bit: false,
            facing_direction: facingDirectionOf('up')
        });

        expect(harness.interact(origin)).toBe(true);
        expect(harness.dimension.stateAt(origin, 'button_pressed_bit')).toBe(true);
        expect(harness.dimension.scheduled).toEqual([{ position: origin, delay: BUTTON_PRESS_TICKS.stone }]);

        harness.tick(origin);

        expect(harness.dimension.stateAt(origin, 'button_pressed_bit')).toBe(false);
    });

    it('holds a wooden button down longer', () => {
        const harness = bindFamily(buttonFamily, 'minecraft:oak_button');
        harness.dimension.set(origin, 'minecraft:oak_button', {
            button_pressed_bit: false,
            facing_direction: facingDirectionOf('up')
        });

        harness.interact(origin);

        expect(harness.dimension.scheduled).toEqual([{ position: origin, delay: BUTTON_PRESS_TICKS.wooden }]);
    });
});

describe('pressurePlateFamily', () => {
    it('puts out full power while something stands on it and releases when nothing does', () => {
        const harness = bindFamily(pressurePlateFamily, 'minecraft:wooden_pressure_plate');
        harness.dimension.set(origin, 'minecraft:wooden_pressure_plate', { redstone_signal: 0 });
        harness.dimension.addEntity('minecraft:player', origin);

        harness.stepOn(origin);

        expect(harness.dimension.stateAt(origin, 'redstone_signal')).toBe(15);

        harness.dimension.removeEntity(1);
        harness.tick(origin);

        expect(harness.dimension.stateAt(origin, 'redstone_signal')).toBe(0);
    });

    it('counts entities on the weighted plates', () => {
        const harness = bindFamily(pressurePlateFamily, 'minecraft:heavy_weighted_pressure_plate');
        harness.dimension.set(origin, 'minecraft:heavy_weighted_pressure_plate', { redstone_signal: 0 });
        for (let count = 0; count < 25; count += 1) harness.dimension.addEntity('minecraft:item', origin);

        harness.stepOn(origin);

        expect(harness.dimension.stateAt(origin, 'redstone_signal')).toBe(3);
    });
});

describe('railFamily', () => {
    it('pops without a block below and follows the power on a powered rail', () => {
        const harness = bindFamily(railFamily, 'minecraft:golden_rail');
        harness.dimension.set(origin, 'minecraft:golden_rail', { rail_data_bit: false, rail_direction: 0 });

        harness.redstone(origin, 15);

        expect(harness.dimension.stateAt(origin, 'rail_data_bit')).toBe(true);

        harness.neighborChanged(origin, 'down');

        expect(harness.dimension.identifierAt(origin)).toBe(AIR);
    });
});
