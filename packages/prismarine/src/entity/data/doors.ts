/**
 * Doors as the entity runtime reads and moves them. Bedrock keeps a door's `open_bit` on its lower
 * half, with `upper_block_bit` set on the half above.
 */
import type { ContentBlockAccess, ContentPosition } from '../../content/world/adapter';

import { LevelEvent } from '@jsprismarine/minecraft';

/** The one door only a mechanism opens. */
export const IRON_DOOR = 'minecraft:iron_door';

/** Whether a block is a door: `minecraft:wooden_door`, `minecraft:iron_door` and the rest, but no trapdoor. */
export const isDoor = (identifier: string): boolean => identifier.endsWith('_door') && !identifier.endsWith('trapdoor');

/** Whether a block state value is set, which Bedrock writes as `true` or `1`. */
export const isSet = (value: unknown): boolean => value === true || value === 1;

/**
 * Opens or closes the door at a position, either half. Bedrock reads a door's `open_bit` from its
 * lower half, and this writes it on both, so the upper half's collision box swings with the door,
 * as Java's `DoorBlock.setOpen` sets `OPEN` on both halves. Anything that is not a door is left
 * alone.
 */
export const setDoorOpen = (blocks: ContentBlockAccess, at: ContentPosition, open: boolean): void => {
    const block = blocks.get(at);
    if (block === undefined || !isDoor(block.identifier)) return;
    const upper = isSet(block.states['upper_block_bit']);
    const lowerAt = upper ? { x: at.x, y: at.y - 1, z: at.z } : at;
    const upperAt = upper ? at : { x: at.x, y: at.y + 1, z: at.z };
    const lower = lowerAt === at ? block : blocks.get(lowerAt);
    if (lower?.identifier !== block.identifier) return;
    const previous = lower.states['open_bit'];
    if (isSet(previous) === open) return;
    const value = typeof previous === 'number' ? (open ? 1 : 0) : open;
    blocks.set(lowerAt, { identifier: lower.identifier, states: { ...lower.states, open_bit: value } }, true);
    const top = upperAt === at ? block : blocks.get(upperAt);
    if (top?.identifier === block.identifier && isSet(top.states['upper_block_bit']))
        blocks.set(upperAt, { identifier: top.identifier, states: { ...top.states, open_bit: value } }, true);
};

/** Plays one level event at a point, as `EntityHostFacts.levelEvent` does. */
export type LevelEventSink = (at: ContentPosition, event: number, data: number) => void;

/** `BreakDoorGoal.getDoorBreakTime`, which Bedrock's block cracking takes as a rate of 65535 per break. */
const DOOR_BREAK_TICKS = 240;

/** The full scale of Bedrock's block cracking, which `START_BLOCK_CRACKING` divides by the ticks a break takes. */
const CRACKING_SCALE = 65_535;

/**
 * Breaks the door at a position, both halves, dropping nothing. Java's `BreakDoorGoal` removes the
 * half it beat on, and the other half, left without its partner, turns to air in
 * `DoorBlock.updateShape`, which drops nothing either.
 *
 * @returns The runtime id the lower half had, for the break particles, or undefined when no door
 *   stood there.
 */
export const removeDoor = (blocks: ContentBlockAccess, at: ContentPosition): number | undefined => {
    const block = blocks.get(at);
    if (block === undefined || !isDoor(block.identifier)) return undefined;
    const upper = isSet(block.states['upper_block_bit']);
    const lowerAt = upper ? { x: at.x, y: at.y - 1, z: at.z } : at;
    const upperAt = upper ? at : { x: at.x, y: at.y + 1, z: at.z };
    const runtimeId = blocks.runtimeIdAt?.(lowerAt);
    for (const half of [upperAt, lowerAt])
        if (blocks.get(half)?.identifier === block.identifier)
            blocks.set(half, { identifier: 'minecraft:air', states: {} }, true);
    return runtimeId ?? 0;
};

/**
 * The level events a door breaker sends, in Bedrock's numbering: Java's 1019 is
 * `SOUND_ZOMBIE_WOODEN_DOOR`, 1021 `SOUND_ZOMBIE_DOOR_CRASH`, and `destroyBlockProgress` the block
 * cracking a Bedrock client animates from one start event at a rate.
 */
export const doorBreakEvents = {
    knock: (sink: LevelEventSink, at: ContentPosition): void => sink(at, LevelEvent.SOUND_ZOMBIE_WOODEN_DOOR, 0),
    progress: (sink: LevelEventSink, at: ContentPosition, stage: number): void => {
        if (stage === 0) sink(at, LevelEvent.START_BLOCK_CRACKING, Math.floor(CRACKING_SCALE / DOOR_BREAK_TICKS));
        else if (stage < 0) sink(at, LevelEvent.STOP_BLOCK_CRACKING, 0);
    },
    crash: (sink: LevelEventSink, at: ContentPosition, runtimeId: number): void => {
        sink(at, LevelEvent.SOUND_ZOMBIE_DOOR_CRASH, 0);
        sink({ x: at.x + 0.5, y: at.y + 0.5, z: at.z + 0.5 }, LevelEvent.PARTICLES_DESTROY_BLOCK, runtimeId);
    }
} as const;
