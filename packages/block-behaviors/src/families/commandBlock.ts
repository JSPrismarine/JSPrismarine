/**
 * The three command blocks: impulse (`command_block`), repeating and chain.
 *
 * The rules are Java's `CommandBlock` and `CommandBlockEntity`, in Bedrock's blocks and with
 * Bedrock's tick delay:
 *
 * - An impulse block that is not always active runs once when power reaches it, after its delay.
 * - A repeating block runs every tick while it is powered or always active, waiting its delay
 *   between runs, and runs its first one at once when it executes on the first tick.
 * - Each block that ran runs the chain in front of it: every chain block in a row, each facing
 *   the next, that is powered or always active.
 * - A conditional block runs only when the command block behind it succeeded last time. Like
 *   Java's, a repeating block checks the condition it marked on its previous tick.
 *
 * The block entity record keeps the command and its state under {@link COMMAND_BLOCK_FIELD}, and
 * its success count under `analogOutput` too, which is what a comparator reads from it.
 */
import type { BlockPosition, HookBlock } from '@jsprismarine/blocks';

import { defineFamily } from '../family';
import { faceOfFacingDirection, offset } from '../geometry';
import { bareName, sibling, stateBoolean, stateNumber } from '../state';
import type { BlockEntityData, WorldActions } from '../world';

/** The record field a command block's state is kept under. */
export const COMMAND_BLOCK_FIELD = 'commandBlock';

/**
 * How far one chain runs, Java's `maxCommandChainLength` default. A chain that loops back on
 * itself stops here rather than running forever.
 */
export const MAX_COMMAND_CHAIN_LENGTH = 65_536;

/** The name a command block runs its command as when it has none of its own, as on Bedrock. */
export const DEFAULT_COMMAND_BLOCK_NAME = '!';

/** What a command block keeps besides its block. */
export interface CommandBlockState {
    readonly command: string;
    /** The name it runs as; empty for {@link DEFAULT_COMMAND_BLOCK_NAME}. */
    readonly customName: string;
    readonly lastOutput: string;
    /** Whether {@link CommandBlockState.lastOutput} is kept. */
    readonly trackOutput: boolean;
    /** How many times the last run succeeded, which a comparator and a conditional block read. */
    readonly successCount: number;
    /** Always active: runs without power. */
    readonly auto: boolean;
    readonly powered: boolean;
    /** Whether its condition held when it last checked, Java's `conditionMet`. */
    readonly conditionMet: boolean;
    /** Bedrock's delay in ticks before a run, and between a repeating block's runs. */
    readonly tickDelay: number;
    /** Whether a repeating block runs at once when it starts rather than after its delay. */
    readonly executeOnFirstTick: boolean;
}

/** The three kinds, by the block's own name. */
export type CommandBlockMode = 'impulse' | 'repeat' | 'chain';

const MODES = ['impulse', 'repeat', 'chain'] as const satisfies readonly CommandBlockMode[];

const MODE_BLOCKS: Readonly<Record<CommandBlockMode, string>> = {
    impulse: 'command_block',
    repeat: 'repeating_command_block',
    chain: 'chain_command_block'
};

/** The kind of command block an identifier names, or undefined for any other block. */
export const commandBlockMode = (identifier: string): CommandBlockMode | undefined => {
    const name = bareName(identifier);
    return MODES.find((mode) => MODE_BLOCKS[mode] === name);
};

/** The block a mode is, in the namespace of `like`. */
export const commandBlockIdentifier = (mode: CommandBlockMode, like = 'minecraft:command_block'): string =>
    sibling(like, MODE_BLOCKS[mode]);

/** A new block's state: no command, and always active for a chain block, as Java places one. */
export const defaultCommandBlockState = (mode: CommandBlockMode): CommandBlockState => ({
    command: '',
    customName: '',
    lastOutput: '',
    trackOutput: true,
    successCount: 0,
    auto: mode === 'chain',
    powered: false,
    conditionMet: false,
    tickDelay: 0,
    executeOnFirstTick: true
});

const isRecordValue = (value: unknown): value is Readonly<Record<string, unknown>> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads the state out of a block entity record, filling what it lacks from the defaults. */
export const commandBlockStateOf = (
    data: BlockEntityData | undefined,
    mode: CommandBlockMode = 'impulse'
): CommandBlockState => {
    const defaults = defaultCommandBlockState(mode);
    const stored = data?.[COMMAND_BLOCK_FIELD];
    if (!isRecordValue(stored)) return defaults;
    const text = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback);
    const flag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);
    const count = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback);
    return {
        command: text(stored.command, defaults.command),
        customName: text(stored.customName, defaults.customName),
        lastOutput: text(stored.lastOutput, defaults.lastOutput),
        trackOutput: flag(stored.trackOutput, defaults.trackOutput),
        successCount: count(stored.successCount, defaults.successCount),
        auto: flag(stored.auto, defaults.auto),
        powered: flag(stored.powered, defaults.powered),
        conditionMet: flag(stored.conditionMet, defaults.conditionMet),
        tickDelay: count(stored.tickDelay, defaults.tickDelay),
        executeOnFirstTick: flag(stored.executeOnFirstTick, defaults.executeOnFirstTick)
    };
};

/** Writes the state into the block's record, keeping the record's other fields. */
const writeState = (world: WorldActions, position: BlockPosition, state: CommandBlockState): void => {
    world.setBlockData(position, {
        ...world.getBlockData(position),
        [COMMAND_BLOCK_FIELD]: state,
        analogOutput: state.successCount
    });
};

/** One command block in the world, read once and written back as its state changes. */
interface Located {
    readonly block: HookBlock;
    readonly mode: CommandBlockMode;
    state: CommandBlockState;
}

const locate = (world: WorldActions, position: BlockPosition): Located | undefined => {
    const block = world.getBlock(position);
    const mode = block === undefined ? undefined : commandBlockMode(block.identifier);
    if (block === undefined || mode === undefined) return undefined;
    return { block, mode, state: commandBlockStateOf(world.getBlockData(position), mode) };
};

/**
 * Patches the block's stored state. Read again first rather than taken from `located`: the command
 * it ran may have changed the block meanwhile, such as by taking its power away, which the nested
 * redstone update wrote.
 */
const update = (world: WorldActions, located: Located, patch: Partial<CommandBlockState>): void => {
    located.state = { ...commandBlockStateOf(world.getBlockData(located.block.position), located.mode), ...patch };
    writeState(world, located.block.position, located.state);
};

/** Which way a command block faces, from its `facing_direction`; down when the state is missing. */
const facingOf = (block: HookBlock) => faceOfFacingDirection(stateNumber(block, 'facing_direction')) ?? 'down';

/**
 * Java's `markConditionMet`: an unconditional block's condition always holds, and a conditional
 * one's holds when the command block behind it succeeded on its last run.
 */
const markConditionMet = (world: WorldActions, located: Located): boolean => {
    let met = true;
    if (stateBoolean(located.block, 'conditional_bit')) {
        const behind = locate(world, offset(located.block.position, facingOf(located.block), -1));
        met = behind !== undefined && behind.state.successCount > 0;
    }
    update(world, located, { conditionMet: met });
    return met;
};

/**
 * Java's `BaseCommandBlock.performCommand`: runs the command and keeps what it reported.
 *
 * @javaSource BaseCommandBlock.performCommand
 */
const perform = (world: WorldActions, located: Located): void => {
    const { command, customName, trackOutput } = located.state;
    if (command.trim() === '') {
        update(world, located, { successCount: 0 });
        return;
    }
    const run = world.runCommand?.(
        located.block.position,
        command,
        customName === '' ? DEFAULT_COMMAND_BLOCK_NAME : customName
    );
    update(world, located, {
        successCount: run?.successCount ?? 0,
        ...(trackOutput && run !== undefined ? { lastOutput: run.output } : {})
    });
    world.notifyNeighbors(located.block.position);
};

/** Runs an active chain block whose condition was marked, or clears a conditional one that failed. */
const runChained = (world: WorldActions, located: Located): void => {
    if (located.state.conditionMet) perform(world, located);
    else if (stateBoolean(located.block, 'conditional_bit')) {
        update(world, located, { successCount: 0 });
        world.notifyNeighbors(located.block.position);
    }
};

/**
 * Java's `executeChain`: runs the chain blocks in front of a block that ran. A chain block with a
 * tick delay, Bedrock's, waits it out: the chain stops there, and its tick runs it and the rest of
 * the chain after it.
 */
const runChain = (world: WorldActions, from: Located): void => {
    let position = from.block.position;
    let facing = facingOf(from.block);
    for (let steps = 0; steps < MAX_COMMAND_CHAIN_LENGTH; steps += 1) {
        position = offset(position, facing);
        const next = locate(world, position);
        if (next === undefined || next.mode !== 'chain') return;
        if (next.state.powered || next.state.auto) {
            markConditionMet(world, next);
            if (next.state.tickDelay > 0) {
                world.scheduleTick(next.block.position, next.state.tickDelay);
                return;
            }
            runChained(world, next);
        }
        facing = facingOf(next.block);
    }
};

/** Ticks before a block runs once started: its delay, or the next tick. */
const startDelay = (located: Located): number =>
    located.mode === 'repeat' && located.state.executeOnFirstTick ? 1 : Math.max(1, located.state.tickDelay);

/**
 * Java's `CommandBlockEntity.scheduleTick`: marks the condition and asks for the tick that runs
 * the block. A chain block never schedules one; the block in front of it runs it.
 *
 * @javaSource CommandBlockEntity.scheduleTick
 */
const start = (world: WorldActions, located: Located): void => {
    if (located.mode === 'chain') return;
    markConditionMet(world, located);
    world.scheduleTick(located.block.position, startDelay(located));
};

/**
 * Java's `CommandBlock.tick`.
 *
 * @javaSource CommandBlock.tick
 */
const tick = (world: WorldActions, located: Located): void => {
    const conditional = stateBoolean(located.block, 'conditional_bit');
    const wasConditionMet = located.state.conditionMet;
    if (located.mode === 'repeat') {
        markConditionMet(world, located);
        if (wasConditionMet) {
            perform(world, located);
            runChain(world, located);
        } else if (conditional) update(world, located, { successCount: 0 });
        if (located.state.powered || located.state.auto)
            world.scheduleTick(located.block.position, Math.max(1, located.state.tickDelay));
    } else if (located.mode === 'impulse') {
        if (wasConditionMet) {
            perform(world, located);
            runChain(world, located);
        } else if (conditional) update(world, located, { successCount: 0 });
    } else {
        // A chain block whose delay a chain waited out: it runs, then so does the rest of the chain.
        runChained(world, located);
        runChain(world, located);
    }
    world.notifyNeighbors(located.block.position);
};

/** What a player's edit of a command block says, in Bedrock's `CommandBlockUpdate` terms. */
export interface CommandBlockEdit {
    readonly mode: CommandBlockMode;
    readonly conditional: boolean;
    /** Bedrock's "Needs Redstone"; off is always active. */
    readonly needsRedstone: boolean;
    readonly command: string;
    readonly customName: string;
    readonly trackOutput: boolean;
    readonly tickDelay: number;
    readonly executeOnFirstTick: boolean;
}

/**
 * Applies a player's edit, as Java's `ServerGamePacketListenerImpl.handleSetCommandBlock` does:
 * the block becomes the mode it was set to, keeping its facing; the command and its options are
 * stored; and a block that became always active starts, as `setAutomatic` and `onModeSwitch` have it.
 *
 * @javaSource ServerGamePacketListenerImpl.handleSetCommandBlock
 * @returns False when the position holds no command block.
 */
export const editCommandBlock = (world: WorldActions, position: BlockPosition, edit: CommandBlockEdit): boolean => {
    const before = locate(world, position);
    if (before === undefined) return false;

    const identifier = commandBlockIdentifier(edit.mode, before.block.identifier);
    world.setBlock(position, identifier, { ...before.block.states, conditional_bit: edit.conditional }, false);
    const auto = !edit.needsRedstone;
    const located: Located = {
        block: world.getBlock(position) ?? before.block,
        mode: edit.mode,
        state: {
            ...before.state,
            command: edit.command,
            customName: edit.customName,
            trackOutput: edit.trackOutput,
            lastOutput: edit.trackOutput ? before.state.lastOutput : '',
            tickDelay: Math.max(0, edit.tickDelay),
            executeOnFirstTick: edit.executeOnFirstTick,
            auto
        }
    };
    writeState(world, position, located.state);

    // `setAutomatic` starts a block that just became always active and has no power; a block
    // that switched mode while always active starts again, as `onModeSwitch` re-applies it. A
    // block switched to repeating starts when it is powered too, since power alone keeps one
    // running, and no redstone update is coming to start it. The host keeps one tick a block, so a
    // block already running is not ticked twice.
    const changed = !before.state.auto || before.mode !== edit.mode;
    const runs =
        edit.mode === 'repeat'
            ? auto || located.state.powered
            : edit.mode === 'impulse' && auto && !located.state.powered;
    if (changed && runs) start(world, located);
    return true;
};

/** The command blocks. */
export const commandBlockFamily = defineFamily(
    'jsprismarine:command_block',
    'Runs the impulse, repeating and chain command blocks on power, on their delay and down a chain, with conditional blocks reading the success of the one behind.',
    {
        onPlace: (event, world) => {
            const mode = commandBlockMode(event.block.identifier);
            if (mode === undefined || world.getBlockData(event.block.position) !== undefined) return;
            writeState(world, event.block.position, defaultCommandBlockState(mode));
        },
        onRedstoneUpdate: (event, world) => {
            const located = locate(world, event.block.position);
            if (located === undefined) return;
            const powered = event.power > 0;
            const wasPowered = located.state.powered;
            if (powered === wasPowered) return;
            update(world, located, { powered });
            if (!powered || located.state.auto || located.mode === 'chain') return;
            start(world, located);
        },
        onTick: (event, world) => {
            const located = locate(world, event.block.position);
            if (located !== undefined) tick(world, located);
        }
    }
);
