/**
 * The vanilla item list, as the deleted class registry exposed it.
 *
 * @deprecated There are no item classes any more. The names come from Java's
 *   committed item table, which is the same list `ItemManager` serves.
 */
import { Item } from './Item';
import { vanillaItemTypes } from './vanillaItemTypes';

/**
 * Every vanilla item, as a constructor each.
 *
 * @deprecated Use `ItemManager.getItems()`.
 */
export const allItems = (): readonly (new () => Item)[] =>
    [...vanillaItemTypes().keys()].map(
        (name) =>
            class extends Item {
                public constructor() {
                    super({ name });
                }
            }
    );
