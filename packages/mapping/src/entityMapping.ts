import type { EntityLoss } from './lossList';
import { ENTITY_LOSSES } from './lossList';
import { entitiesTable } from './tables';

/** What a Java entity type lookup produced. */
export type EntityMappingResult =
    /** A Bedrock entity identifier the pinned identifier list knows. */
    | { readonly kind: 'mapped'; readonly bedrock: string }
    /**
     * A reviewed loss. `rerender` losses carry the substitute entity in
     * `loss.bedrockFallback`, `block` losses the Bedrock block identifier, and
     * `unrepresentable` losses carry no fallback at all.
     */
    | { readonly kind: 'loss'; readonly loss: EntityLoss }
    /** A non-`minecraft:` identifier, passed through untouched for custom content. */
    | { readonly kind: 'passthrough'; readonly bedrock: string }
    /** Not a Java 26.3 entity type. */
    | { readonly kind: 'unknown'; readonly javaId: string };

const entityLossById = new Map<string, EntityLoss>(ENTITY_LOSSES.map((loss) => [loss.javaId, loss]));

/**
 * Maps one Java 26.3 entity type to its Bedrock 1.26.51 entity identifier.
 * Total over all 161 Java entity types: every type returns `mapped` or a
 * reviewed `loss`, never `undefined`. Non-`minecraft:` identifiers pass
 * through untouched.
 */
export const javaEntityTypeToBedrock = (javaId: string): EntityMappingResult => {
    if (!javaId.startsWith('minecraft:')) return { kind: 'passthrough', bedrock: javaId };
    const loss = entityLossById.get(javaId);
    if (loss !== undefined) return { kind: 'loss', loss };
    const bedrock = entitiesTable.entities[javaId];
    if (bedrock === undefined) return { kind: 'unknown', javaId };
    return { kind: 'mapped', bedrock };
};
