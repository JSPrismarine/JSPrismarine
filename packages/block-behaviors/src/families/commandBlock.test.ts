import { describe, expect, it } from 'vitest';

import { facingDirectionOf } from '../geometry';
import { bindFamily } from '../harness';
import type { FamilyHarness } from '../harness';
import type { CommandBlockEdit, CommandBlockState } from './commandBlock';
import { COMMAND_BLOCK_FIELD, commandBlockFamily, commandBlockStateOf, editCommandBlock } from './commandBlock';

const EAST = facingDirectionOf('east');
const origin = { x: 0, y: 0, z: 0 };
const east = (steps: number) => ({ x: steps, y: 0, z: 0 });

/** A command block of a kind at a position, facing east, with a state. */
const put = (
    harness: FamilyHarness,
    position: { x: number; y: number; z: number },
    identifier: string,
    state: Partial<CommandBlockState> = {},
    conditional = false
): void => {
    harness.dimension.set(position, identifier, { facing_direction: EAST, conditional_bit: conditional });
    harness.place(position);
    const placed = commandBlockStateOf(harness.dimension.getBlockData(position));
    harness.dimension.setBlockData(position, {
        ...harness.dimension.getBlockData(position),
        [COMMAND_BLOCK_FIELD]: { ...placed, ...state }
    });
};

const stateAt = (harness: FamilyHarness, position: { x: number; y: number; z: number }) =>
    commandBlockStateOf(harness.dimension.getBlockData(position));

const ran = (harness: FamilyHarness) => harness.dimension.commands.map((entry) => entry.command);

describe('commandBlockFamily: an impulse block', () => {
    it('keeps a fresh record when placed, with no command and needing redstone', () => {
        const harness = bindFamily(commandBlockFamily, 'minecraft:command_block');
        harness.dimension.set(origin, 'minecraft:command_block', { facing_direction: EAST });
        harness.place(origin);

        expect(stateAt(harness, origin)).toMatchObject({ command: '', auto: false, successCount: 0 });
    });

    it('runs once on the rising edge of power, a tick later, as its custom name or `!`', () => {
        const harness = bindFamily(commandBlockFamily, 'minecraft:command_block');
        put(harness, origin, 'minecraft:command_block', { command: 'say hi' });

        harness.redstone(origin, 15);
        harness.redstone(origin, 15);
        expect(harness.dimension.scheduled).toEqual([{ position: origin, delay: 1 }]);
        expect(ran(harness)).toEqual([]);

        harness.tick(origin);
        expect(harness.dimension.commands).toEqual([{ position: origin, command: 'say hi', name: '!' }]);
        expect(stateAt(harness, origin).successCount).toBe(1);
        expect(harness.dimension.getBlockData(origin)?.analogOutput).toBe(1);

        harness.redstone(origin, 0);
        harness.redstone(origin, 8);
        expect(harness.dimension.scheduled).toHaveLength(2);
    });

    it('waits its tick delay before running', () => {
        const harness = bindFamily(commandBlockFamily, 'minecraft:command_block');
        put(harness, origin, 'minecraft:command_block', { command: 'say later', tickDelay: 20 });

        harness.redstone(origin, 1);

        expect(harness.dimension.scheduled).toEqual([{ position: origin, delay: 20 }]);
    });

    it('keeps the last output only while it tracks output, and counts a failure as no success', () => {
        const harness = bindFamily(commandBlockFamily, 'minecraft:command_block');
        harness.dimension.commandResult = () => ({ successCount: 0, output: 'No targets matched selector' });
        put(harness, origin, 'minecraft:command_block', { command: 'kill @e[type=pig]' });

        harness.redstone(origin, 15);
        harness.tick(origin);

        expect(stateAt(harness, origin)).toMatchObject({
            successCount: 0,
            lastOutput: 'No targets matched selector'
        });
    });

    it('runs nothing for an empty command', () => {
        const harness = bindFamily(commandBlockFamily, 'minecraft:command_block');
        put(harness, origin, 'minecraft:command_block', { command: '   ', successCount: 3 });

        harness.redstone(origin, 15);
        harness.tick(origin);

        expect(ran(harness)).toEqual([]);
        expect(stateAt(harness, origin).successCount).toBe(0);
    });
});

describe('commandBlockFamily: a repeating block', () => {
    it('runs every tick while powered, from the first, and stops once power goes', () => {
        const harness = bindFamily(commandBlockFamily, 'minecraft:repeating_command_block');
        put(harness, origin, 'minecraft:repeating_command_block', { command: 'say again' });

        harness.redstone(origin, 15);
        expect(harness.dimension.scheduled.at(-1)).toEqual({ position: origin, delay: 1 });
        harness.tick(origin);
        harness.tick(origin);
        expect(ran(harness)).toEqual(['say again', 'say again']);
        expect(harness.dimension.scheduled).toHaveLength(3);

        harness.redstone(origin, 0);
        harness.tick(origin);
        expect(ran(harness)).toHaveLength(3);
        expect(harness.dimension.scheduled).toHaveLength(3);
    });

    it('stops repeating when the command it ran took its power away', () => {
        const harness = bindFamily(commandBlockFamily, 'minecraft:repeating_command_block');
        put(harness, origin, 'minecraft:repeating_command_block', { command: 'setblock ~ ~ ~1 air' });
        // The command breaks the lever behind it: the block hears the power go before the run returns.
        harness.dimension.commandResult = () => {
            harness.redstone(origin, 0);
            return { successCount: 1, output: '' };
        };

        harness.redstone(origin, 15);
        harness.tick(origin);

        expect(stateAt(harness, origin).powered).toBe(false);
        expect(harness.dimension.scheduled).toHaveLength(1);
    });

    it('waits its delay between runs, and before the first when it does not execute on the first tick', () => {
        const harness = bindFamily(commandBlockFamily, 'minecraft:repeating_command_block');
        put(harness, origin, 'minecraft:repeating_command_block', {
            command: 'say slow',
            tickDelay: 10,
            executeOnFirstTick: false
        });

        harness.redstone(origin, 15);
        harness.tick(origin);

        expect(harness.dimension.scheduled.map((tick) => tick.delay)).toEqual([10, 10]);
    });
});

describe('commandBlockFamily: a chain', () => {
    it('runs the chain blocks in front of a block that ran, while each is active, up to the first other block', () => {
        const harness = bindFamily(commandBlockFamily, 'minecraft:command_block');
        put(harness, origin, 'minecraft:command_block', { command: 'say one' });
        put(harness, east(1), 'minecraft:chain_command_block', { command: 'say two' });
        put(harness, east(2), 'minecraft:chain_command_block', { command: 'say three', auto: false });
        put(harness, east(3), 'minecraft:chain_command_block', { command: 'say four' });
        put(harness, east(4), 'minecraft:command_block', { command: 'say never' });

        harness.redstone(origin, 15);
        harness.tick(origin);

        expect(ran(harness)).toEqual(['say one', 'say two', 'say four']);
    });

    it('waits out a chain block’s delay, then runs it and the rest of the chain', () => {
        const harness = bindFamily(commandBlockFamily, 'minecraft:command_block');
        put(harness, origin, 'minecraft:command_block', { command: 'say one' });
        put(harness, east(1), 'minecraft:chain_command_block', { command: 'say two', tickDelay: 20 });
        put(harness, east(2), 'minecraft:chain_command_block', { command: 'say three' });

        harness.redstone(origin, 15);
        harness.tick(origin);
        expect(ran(harness)).toEqual(['say one']);
        expect(harness.dimension.scheduled.at(-1)).toEqual({ position: east(1), delay: 20 });

        harness.tick(east(1));
        expect(ran(harness)).toEqual(['say one', 'say two', 'say three']);
    });

    it('tells its neighbors when a conditional chain block fails, so a comparator reads 0', () => {
        const harness = bindFamily(commandBlockFamily, 'minecraft:command_block');
        harness.dimension.commandResult = () => ({ successCount: 0, output: '' });
        put(harness, origin, 'minecraft:command_block', { command: 'fail' });
        put(harness, east(1), 'minecraft:chain_command_block', { command: 'say skipped', successCount: 2 }, true);

        harness.redstone(origin, 15);
        harness.tick(origin);

        expect(harness.dimension.notified).toContainEqual(east(1));
        expect(harness.dimension.getBlockData(east(1))?.analogOutput).toBe(0);
    });

    it('runs a conditional chain block only when the block behind it succeeded', () => {
        const harness = bindFamily(commandBlockFamily, 'minecraft:command_block');
        harness.dimension.commandResult = (command) => ({ successCount: command === 'fail' ? 0 : 1, output: '' });
        put(harness, origin, 'minecraft:command_block', { command: 'fail' });
        put(harness, east(1), 'minecraft:chain_command_block', { command: 'say skipped', successCount: 2 }, true);
        put(harness, east(2), 'minecraft:chain_command_block', { command: 'say runs' });

        harness.redstone(origin, 15);
        harness.tick(origin);

        expect(ran(harness)).toEqual(['fail', 'say runs']);
        expect(stateAt(harness, east(1)).successCount).toBe(0);
    });
});

describe('editCommandBlock', () => {
    const edit = (overrides: Partial<CommandBlockEdit> = {}): CommandBlockEdit => ({
        mode: 'impulse',
        conditional: false,
        needsRedstone: true,
        command: 'say edited',
        customName: '',
        trackOutput: true,
        tickDelay: 0,
        executeOnFirstTick: true,
        ...overrides
    });

    it('stores the command and turns the block into the mode it was set to, keeping its facing', () => {
        const harness = bindFamily(commandBlockFamily, 'minecraft:command_block');
        put(harness, origin, 'minecraft:command_block');

        expect(editCommandBlock(harness.dimension, origin, edit({ mode: 'repeat', conditional: true }))).toBe(true);

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:repeating_command_block');
        expect(harness.dimension.stateAt(origin, 'facing_direction')).toBe(EAST);
        expect(harness.dimension.stateAt(origin, 'conditional_bit')).toBe(true);
        expect(stateAt(harness, origin).command).toBe('say edited');
        expect(harness.dimension.scheduled).toEqual([]);
    });

    it('starts a block set to always active, which then runs without power', () => {
        const harness = bindFamily(commandBlockFamily, 'minecraft:command_block');
        put(harness, origin, 'minecraft:command_block');

        editCommandBlock(harness.dimension, origin, edit({ needsRedstone: false, customName: 'Herald' }));
        expect(harness.dimension.scheduled).toEqual([{ position: origin, delay: 1 }]);
        harness.tick(origin);

        expect(harness.dimension.commands).toEqual([{ position: origin, command: 'say edited', name: 'Herald' }]);
    });

    it('starts a powered block switched to repeating, which power alone keeps running', () => {
        const harness = bindFamily(commandBlockFamily, 'minecraft:command_block');
        put(harness, origin, 'minecraft:command_block', { powered: true });

        editCommandBlock(harness.dimension, origin, edit({ mode: 'repeat' }));

        expect(harness.dimension.scheduled).toEqual([{ position: origin, delay: 1 }]);
    });

    it('starts a powered repeating block set to always active', () => {
        const harness = bindFamily(commandBlockFamily, 'minecraft:repeating_command_block');
        put(harness, origin, 'minecraft:repeating_command_block', { powered: true });

        editCommandBlock(harness.dimension, origin, edit({ mode: 'repeat', needsRedstone: false }));

        expect(harness.dimension.scheduled).toEqual([{ position: origin, delay: 1 }]);
    });

    it('leaves a powered impulse block that already ran alone when only its command changes', () => {
        const harness = bindFamily(commandBlockFamily, 'minecraft:command_block');
        put(harness, origin, 'minecraft:command_block', { powered: true });

        editCommandBlock(harness.dimension, origin, edit());

        expect(harness.dimension.scheduled).toEqual([]);
    });

    it('refuses a position that holds no command block', () => {
        const harness = bindFamily(commandBlockFamily, 'minecraft:command_block');
        harness.dimension.set(origin, 'minecraft:stone');

        expect(editCommandBlock(harness.dimension, origin, edit())).toBe(false);
        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:stone');
    });
});
