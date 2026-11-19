import type { ItemLoss } from './lossList';
import { ITEM_LOSSES } from './lossList';
import type { ItemsTable } from './tables';
import { itemsTable } from './tables';

/** One Bedrock item reference: the identifier and the legacy damage value when one selects a sub-item. */
export interface BedrockItem {
    /** The namespaced Bedrock item identifier. */
    readonly identifier: string;
    /** The legacy Bedrock damage value, present only where it selects a sub-item. */
    readonly data?: number;
}

/** What a Java item lookup produced. */
export type ItemMappingResult =
    /** A Bedrock item the pinned item registry knows, with the Java identity intact or recoverable. */
    | { readonly kind: 'mapped'; readonly bedrock: BedrockItem }
    /** A reviewed loss: the Java item's identity does not survive, and `bedrock` is its listed fallback. */
    | { readonly kind: 'loss'; readonly loss: ItemLoss; readonly bedrock: BedrockItem }
    /** A non-`minecraft:` identifier, passed through untouched for custom content. */
    | { readonly kind: 'passthrough'; readonly bedrock: BedrockItem }
    /** Not a Java 26.3 item. */
    | { readonly kind: 'unknown'; readonly javaId: string };

const itemLossById = new Map<string, ItemLoss>(ITEM_LOSSES.map((loss) => [loss.javaId, loss]));

/**
 * Builds an item lookup over one release's item table, which is how the item type generator maps
 * a release other than the default through that release's own table.
 *
 * @param table - A generated `src/tables/<release>/items.json`.
 * @returns A lookup with {@link javaItemToBedrock}'s contract over that table.
 */
export const createJavaItemMapping =
    (table: ItemsTable) =>
    (javaId: string): ItemMappingResult => {
        if (!javaId.startsWith('minecraft:')) {
            return { kind: 'passthrough', bedrock: { identifier: javaId } };
        }
        const entry = table.items[javaId];
        if (entry === undefined) return { kind: 'unknown', javaId };
        const bedrock: BedrockItem = {
            identifier: entry.bedrockIdentifier,
            ...(entry.bedrockData !== undefined ? { data: entry.bedrockData } : {})
        };
        const loss = itemLossById.get(javaId);
        if (loss !== undefined) return { kind: 'loss', loss, bedrock };
        return { kind: 'mapped', bedrock };
    };

/**
 * Maps one Java 26.3 item identifier to its item in the pinned Bedrock release. Total over
 * all 1658 Java items: every item returns `mapped` or a reviewed `loss`,
 * never `undefined`. Non-`minecraft:` identifiers pass through untouched.
 */
export const javaItemToBedrock: (javaId: string) => ItemMappingResult = createJavaItemMapping(itemsTable);
