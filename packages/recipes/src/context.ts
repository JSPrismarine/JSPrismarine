import type { TagLookup } from './ingredient';

/**
 * The lookups this package needs from the rest of the server. Every one is
 * injected so the evaluator depends on no registry implementation, and every
 * one is optional so a caller can start with none and add them as the
 * registries come up. Each entry below says what stops working without it.
 */
export interface RecipeContext {
    /**
     * Resolves a Java tag to its members. Needed at parse time: without it
     * every `#tag` ingredient accepts nothing and parsing reports a warning.
     */
    readonly tags?: TagLookup;
    /**
     * The item an ingredient leaves behind when a craft consumes it, from
     * Java's `minecraft:crafting_remainder` item component. Without it a
     * bucket or a honey bottle vanishes into the craft.
     */
    readonly remainderOf?: (itemId: string) => string | undefined;
    /**
     * An item's `minecraft:max_damage`, or `undefined` for an item that takes
     * no damage. Without it the repair recipe never matches, because
     * damageability is what it tests for.
     */
    readonly maxDamageOf?: (itemId: string) => number | undefined;
    /**
     * The packed 24-bit RGB value of a dye color name such as `red`, from
     * Java's `DyeColor` table. Without it dyed armor keeps its old color and
     * a firework star records no colors.
     */
    readonly dyeColorRgb?: (dyeColor: string) => number | undefined;
}

/** A context with no lookups, used when a caller passes none. */
export const EMPTY_CONTEXT: RecipeContext = {};
