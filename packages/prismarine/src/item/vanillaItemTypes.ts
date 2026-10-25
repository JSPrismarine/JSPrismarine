/**
 * Java's committed item table, resolved once, for a server with no content
 * build.
 *
 * `@jsprismarine/items` ships Java 26.3's item definitions in the package, so
 * the 122 data components an item carries are readable with nothing fetched
 * and nothing on disk. That is what every number an item answers comes from
 * when it was built without a content build behind it, which is an `Item`
 * constructed with no `content` and the test doubles that hand `ItemManager`
 * no `getContent` at all.
 *
 * The one thing it cannot supply is the merged tag set, so a `#tag` holder
 * set matches nothing here; see {@link import('./holderSets').holderSetIncludes}.
 */
import { loadItemTypes } from '@jsprismarine/items';
import type { ItemType } from '@jsprismarine/items';

let types: ReadonlyMap<string, ItemType> | undefined;

/**
 * Java's item types by identifier, resolved on first use and kept.
 *
 * @returns One resolved type per Java item, with its components bound.
 */
export const vanillaItemTypes = (): ReadonlyMap<string, ItemType> => {
    types ??= loadItemTypes().types;
    return types;
};
