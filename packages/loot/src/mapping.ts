import type { ItemStack } from '@jsprismarine/predicates';

/**
 * The Java-to-Bedrock seam for a rolled result.
 *
 * A loot table names Java items, and a Bedrock client wants Bedrock items.
 * `@jsprismarine/mapping` owns that translation and is the only package that
 * knows two editions exist, so this package takes its lookup as a parameter
 * and stays edition-agnostic. `javaItemToBedrock` satisfies
 * {@link ItemIdentifierMapper} as it is.
 */

/** One Bedrock item: the identifier and the legacy damage value when one selects a sub-item. */
export interface BedrockItemReference {
    readonly identifier: string;
    readonly data?: number;
}

/** What a Java item identifier lookup produced. */
export type ItemMappingOutcome =
    /** A Bedrock item, either a clean mapping or a non-`minecraft:` identifier passed through. */
    | { readonly kind: 'mapped' | 'passthrough'; readonly bedrock: BedrockItemReference }
    /** A reviewed loss: the Java item's identity does not survive, and `bedrock` is its listed fallback. */
    | {
          readonly kind: 'loss';
          readonly bedrock: BedrockItemReference;
          readonly loss: { readonly reason: string; readonly reference: string };
      }
    /** Not an item of the pinned Java version. */
    | { readonly kind: 'unknown'; readonly javaId: string };

/** Maps one Java item identifier to Bedrock. Never returns undefined. */
export type ItemIdentifierMapper = (javaId: string) => ItemMappingOutcome;

/** One rolled stack after translation. */
export interface BedrockStack {
    readonly identifier: string;
    readonly data?: number;
    readonly count: number;
    /**
     * The Java data components, carried over untouched. Translating component
     * payloads belongs to the item layer, not to the loot evaluator.
     */
    readonly components: ReadonlyMap<string, unknown>;
    /** The Java item the stack came from, kept so a report traces back to the table. */
    readonly javaId: string;
}

/** One translation a caller should know about. */
export interface LootMappingLoss {
    readonly javaId: string;
    /**
     * `fallback` kept a reviewed substitute item; `unknown` had no Bedrock
     * item at all and the stack was dropped.
     */
    readonly kind: 'fallback' | 'unknown';
    readonly bedrockIdentifier?: string;
    readonly reason: string;
    /** Where the reviewed loss is documented. Absent for an unknown identifier. */
    readonly reference?: string;
}

/** A translated roll: the stacks a Bedrock client can be sent, and everything that did not survive. */
export interface MappedLoot {
    readonly stacks: readonly BedrockStack[];
    /** One entry per affected stack, in the order the roll produced them. Never silently empty. */
    readonly losses: readonly LootMappingLoss[];
}

/**
 * Translates a rolled result into Bedrock items.
 *
 * A reviewed loss keeps its fallback item and reports; an identifier the
 * pinned Java version does not have is dropped and reports. Nothing is
 * dropped without an entry in `losses`.
 */
export const mapLootToBedrock = (stacks: readonly ItemStack[], mapper: ItemIdentifierMapper): MappedLoot => {
    const mapped: BedrockStack[] = [];
    const losses: LootMappingLoss[] = [];

    for (const stack of stacks) {
        const outcome = mapper(stack.id);
        if (outcome.kind === 'unknown') {
            losses.push({
                javaId: stack.id,
                kind: 'unknown',
                reason: `${stack.id} is not an item of the pinned Java version`
            });
            continue;
        }

        if (outcome.kind === 'loss') {
            losses.push({
                javaId: stack.id,
                kind: 'fallback',
                bedrockIdentifier: outcome.bedrock.identifier,
                reason: outcome.loss.reason,
                reference: outcome.loss.reference
            });
        }

        mapped.push({
            identifier: outcome.bedrock.identifier,
            ...(outcome.bedrock.data === undefined ? {} : { data: outcome.bedrock.data }),
            count: stack.count,
            components: stack.components,
            javaId: stack.id
        });
    }

    return { stacks: mapped, losses };
};
