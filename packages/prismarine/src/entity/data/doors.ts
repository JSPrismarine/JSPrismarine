/**
 * Doors as the entity runtime reads and moves them. Bedrock keeps a door's `open_bit` on its lower
 * half, with `upper_block_bit` set on the half above.
 */
import type { ContentBlockAccess, ContentPosition } from '../../content/world/adapter';

/** The one door only a mechanism opens. */
export const IRON_DOOR = 'minecraft:iron_door';

/** Whether a block is a door: `minecraft:wooden_door`, `minecraft:iron_door` and the rest, but no trapdoor. */
export const isDoor = (identifier: string): boolean => identifier.endsWith('_door') && !identifier.endsWith('trapdoor');

/** Whether a block state value is set, which Bedrock writes as `true` or `1`. */
export const isSet = (value: unknown): boolean => value === true || value === 1;

/**
 * Opens or closes the door at a position, either half, by writing `open_bit` on its lower half.
 * Anything that is not a door is left alone.
 */
export const setDoorOpen = (blocks: ContentBlockAccess, at: ContentPosition, open: boolean): void => {
    const block = blocks.get(at);
    if (block === undefined || !isDoor(block.identifier)) return;
    const lowerAt = isSet(block.states['upper_block_bit']) ? { x: at.x, y: at.y - 1, z: at.z } : at;
    const lower = lowerAt === at ? block : blocks.get(lowerAt);
    if (lower?.identifier !== block.identifier) return;
    const previous = lower.states['open_bit'];
    if (isSet(previous) === open) return;
    const value = typeof previous === 'number' ? (open ? 1 : 0) : open;
    blocks.set(lowerAt, { identifier: lower.identifier, states: { ...lower.states, open_bit: value } }, true);
};
