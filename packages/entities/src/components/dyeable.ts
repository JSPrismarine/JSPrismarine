import type { ComponentFactory } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';

import type { EntityHooks } from '../hooks';
import { isRecord, stringAt } from './schemas';

/** What `minecraft:is_dyeable` declares. */
export interface DyeableParams {
    /** The touch-screen prompt shown when a player can dye this entity. */
    readonly interactText?: string;
}

/**
 * Whether a parsed value has the shape exposed by `minecraft:is_dyeable`.
 *
 * @param value - The parsed component parameters.
 * @returns Whether the value is a dyeable component body.
 */
export const isDyeableParams = (value: unknown): value is DyeableParams =>
    isRecord(value) && (value.interactText === undefined || typeof value.interactText === 'string');

/** `minecraft:is_dyeable`, including its optional touch-screen prompt. */
export const dyeable: ComponentFactory<EntityHooks, DyeableParams> = {
    name: 'minecraft:is_dyeable',
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        if (value.interact_text !== undefined && typeof value.interact_text !== 'string')
            return rejected('interact_text must be a string');

        const interactText = stringAt(value, 'interact_text');
        return accepted(interactText === undefined ? {} : { interactText });
    },
    create: () => ({})
};
