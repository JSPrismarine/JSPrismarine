/** Java resource locations, which allow fewer characters than a Bedrock pack's paths and names. */

/** The namespace every asset converted from a Bedrock pack is written under. */
export const BEDROCK_NAMESPACE = 'bedrock';

/**
 * A path a Java resource location accepts: lowercase, with every character outside `a-z0-9/._-`
 * made an underscore. `textures/Blocks/My Stone` becomes `textures/blocks/my_stone`.
 */
export const javaPath = (path: string): string => path.toLowerCase().replace(/[^a-z0-9/._-]/g, '_');

/** A path without its last extension: `textures/blocks/stone.png` is `textures/blocks/stone`. */
export const withoutExtension = (path: string): string => path.replace(/\.[^./]*$/, '');
