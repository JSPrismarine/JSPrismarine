/**
 * A y level expressed relative to the dimension rather than as an absolute number.
 *
 * The same four forms appear in material rules, height providers and feature placement, which
 * is why they live beside the surface pass rather than inside it.
 */
export type VerticalAnchor =
    | { readonly type: 'absolute'; readonly y: number }
    | { readonly type: 'above_bottom'; readonly offset: number }
    | { readonly type: 'below_top'; readonly offset: number }
    | { readonly type: 'relative_to_sea_level'; readonly offset: number };

/**
 * The dimension extent a {@link VerticalAnchor} resolves against.
 *
 * Java builds this from the chunk generator and the level, taking the narrower of the two
 * vertical extents. Nothing here reads a level, so a caller supplies the three numbers.
 */
export interface WorldGenerationContext {
    /** The lowest y the generator produces. */
    readonly minGenY: number;
    /** How many blocks the generator produces above `minGenY`. */
    readonly genDepth: number;
    /** The dimension's sea level. */
    readonly seaLevel: number;
}

/** Builds the generation context a dimension's noise settings describe. */
export const createWorldGenerationContext = (settings: {
    readonly noiseSettings: { readonly minY: number; readonly height: number };
    readonly seaLevel: number;
}): WorldGenerationContext => ({
    minGenY: settings.noiseSettings.minY,
    genDepth: settings.noiseSettings.height,
    seaLevel: settings.seaLevel
});

/** Resolves an anchor to a y level. */
export const resolveAnchorY = (anchor: VerticalAnchor, context: WorldGenerationContext): number => {
    switch (anchor.type) {
        case 'absolute':
            return anchor.y;
        case 'above_bottom':
            return context.minGenY + anchor.offset;
        case 'below_top':
            return context.genDepth - 1 + context.minGenY - anchor.offset;
        case 'relative_to_sea_level':
            return context.seaLevel + anchor.offset;
    }
};

const integer = (value: unknown, path: string): number => {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new TypeError(`${path}: expected an integer, got ${JSON.stringify(value)}`);
    }
    return value;
};

/**
 * Reads a `vertical_anchor` value, which Java writes as a one-key object.
 *
 * @throws When the object does not hold exactly one of the four known keys.
 */
export const parseVerticalAnchor = (source: unknown, path = '<vertical_anchor>'): VerticalAnchor => {
    if (typeof source !== 'object' || source === null || Array.isArray(source)) {
        throw new TypeError(`${path}: expected an object, got ${JSON.stringify(source)}`);
    }
    // A parsed JSON document is `unknown`; each candidate key is checked below.
    const raw = source as Record<string, unknown>;
    if ('absolute' in raw) return { type: 'absolute', y: integer(raw['absolute'], `${path}.absolute`) };
    if ('above_bottom' in raw) {
        return { type: 'above_bottom', offset: integer(raw['above_bottom'], `${path}.above_bottom`) };
    }
    if ('below_top' in raw) return { type: 'below_top', offset: integer(raw['below_top'], `${path}.below_top`) };
    if ('relative_to_sea_level' in raw) {
        return {
            type: 'relative_to_sea_level',
            offset: integer(raw['relative_to_sea_level'], `${path}.relative_to_sea_level`)
        };
    }
    throw new TypeError(
        `${path}: expected one of absolute, above_bottom, below_top or relative_to_sea_level, got ` +
            JSON.stringify(source)
    );
};
