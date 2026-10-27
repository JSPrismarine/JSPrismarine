import type { ServerContent } from '../content/ServerContent';
import { Item } from './Item';
import { vanillaItemTypes } from './vanillaItemTypes';

/** Resolves an item from one content build, or from the vanilla table when tests omit content. */
export const itemFromContent = (identifier: string, content?: ServerContent): Item | null => {
    const types = content?.items.types ?? vanillaItemTypes();
    if (!types.has(identifier)) return null;

    return new Item({ name: identifier, ...(content === undefined ? {} : { content }) });
};
