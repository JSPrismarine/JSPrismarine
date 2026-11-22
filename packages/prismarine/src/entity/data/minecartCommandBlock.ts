/**
 * A command block minecart's command, after Java 26.3's `MinecartCommandBlock`.
 *
 * The cart keeps its command in saved component state, set from the command block screen. Over a
 * powered activator rail its `minecraft:rail_sensor` asks it to run the command, and Java's
 * `activateMinecart` runs it at most once every four ticks.
 */
import type { CommandRun } from '@jsprismarine/block-behaviors';
import { DEFAULT_COMMAND_BLOCK_NAME } from '@jsprismarine/block-behaviors/families/commandBlock';
import { defineComponentState, stateField } from '@jsprismarine/entities/componentState';

import type { DataEntity } from './DataEntity';

/** The cart that carries a command. */
export const COMMAND_BLOCK_MINECART = 'minecraft:command_block_minecart';

/** Java's `MinecartCommandBlock.ACTIVATION_DELAY`: ticks between two runs over a powered rail. */
export const MINECART_ACTIVATION_DELAY = 4;

const isText = (value: unknown): value is string => typeof value === 'string';

/** What the cart keeps: its command, the name it runs as, its last output, and its last run. */
const commandState = defineComponentState('jsprismarine:command_block_minecart', {
    command: isText,
    customName: isText,
    lastOutput: isText,
    trackOutput: stateField.boolean,
    successCount: stateField.number,
    /** The game tick of the last run, or -1 before the first. */
    lastActivated: stateField.number
});

/** The cart's command state, or undefined for a cart that never had one set. */
export const minecartCommandOf = (entity: DataEntity) => entity.instance.componentState.get(commandState);

/** What a player set on the cart's command block screen. */
export interface MinecartCommandEdit {
    readonly command: string;
    readonly customName: string;
    readonly trackOutput: boolean;
}

/** Stores what a player set, keeping the cart's last run so the four-tick spacing holds. */
export const setMinecartCommand = (entity: DataEntity, edit: MinecartCommandEdit): void => {
    const before = minecartCommandOf(entity);
    entity.instance.componentState.set(commandState, {
        command: edit.command,
        customName: edit.customName,
        trackOutput: edit.trackOutput,
        lastOutput: edit.trackOutput ? (before?.lastOutput ?? '') : '',
        successCount: before?.successCount ?? 0,
        lastActivated: before?.lastActivated ?? -1
    });
};

/**
 * Java's `MinecartCommandBlock.activateMinecart` on a powered rail: runs the command when four
 * ticks have passed since the last run.
 *
 * @param gameTime - The world's game tick now.
 * @param run - Runs a command as the cart, from where it stands, under a name.
 * @returns Whether the command ran.
 */
export const activateMinecartCommand = (
    entity: DataEntity,
    gameTime: number,
    run: (command: string, name: string) => CommandRun | undefined
): boolean => {
    const state = minecartCommandOf(entity);
    if (state === undefined || state.command.trim() === '') return false;
    if (state.lastActivated >= 0 && gameTime - state.lastActivated < MINECART_ACTIVATION_DELAY) return false;
    const result = run(state.command, state.customName === '' ? DEFAULT_COMMAND_BLOCK_NAME : state.customName);
    entity.instance.componentState.set(commandState, {
        ...state,
        successCount: result?.successCount ?? 0,
        lastOutput: state.trackOutput && result !== undefined ? result.output : state.lastOutput,
        lastActivated: gameTime
    });
    return true;
};
