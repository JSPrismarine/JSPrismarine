/**
 * The block translation keys Bedrock captured from its own block registry.
 *
 * The generated table comes from the same server capture as the block geometry. Keeping the key
 * beside the block definition lets the overlay send the name Bedrock's client already localizes.
 */
import table from './tables/vanillaBlockDisplayNames.json';

const displayNames: Readonly<Record<string, string>> = table.blocks;

/**
 * The Bedrock localization key for one captured block.
 *
 * @param identifier - The namespaced Bedrock block identifier.
 * @returns The translation key, or undefined when the block is not in the capture.
 */
export const bedrockBlockDisplayNameOf = (identifier: string): string | undefined => displayNames[identifier];
