import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

/**
 * Resolves a Java entity name to the identifier used by the Bedrock-backed entity runtime.
 *
 * Java item data and interactions carry Java names, while the loaded entity definitions use
 * Bedrock names. Reviewed losses use their declared fallback, custom identifiers pass through,
 * Bedrock-only names stay intact when the loaded registry declares them, and an unknown name
 * with no matching definition has no runtime identifier.
 *
 * @param javaIdentifier - The identifier from Java item data or an entity interaction.
 * @param isRegistered - Whether the loaded registry declares an identifier as-is.
 * @returns The loaded entity identifier, or undefined when no mapping or definition exists.
 */
export const bedrockEntityIdentifierOf = (
    javaIdentifier: string,
    isRegistered: (identifier: string) => boolean
): string | undefined => {
    const mapping = javaEntityTypeToBedrock(javaIdentifier);
    switch (mapping.kind) {
        case 'mapped':
        case 'passthrough':
            return mapping.bedrock;
        case 'loss':
            return mapping.loss.bedrockFallback;
        case 'unknown':
            return isRegistered(javaIdentifier) ? javaIdentifier : undefined;
    }
};
