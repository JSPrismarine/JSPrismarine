import type { BlockStateValue } from '@jsprismarine/blocks';
import { isRecord } from '@jsprismarine/entities';

/**
 * The block states in an untyped record, such as an entity's spawn data or component params:
 * each entry whose value is a string, number or boolean, and nothing for a value that is not a
 * record at all.
 */
export const blockStatesOf = (value: unknown): Record<string, BlockStateValue> => {
    const states: Record<string, BlockStateValue> = {};
    if (!isRecord(value)) return states;
    for (const [key, state] of Object.entries(value)) {
        if (typeof state === 'string' || typeof state === 'number' || typeof state === 'boolean') states[key] = state;
    }
    return states;
};
