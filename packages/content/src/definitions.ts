/**
 * The first of the three content layers: parsed, validated, immutable JSON for
 * one identifier.
 *
 * `@jsprismarine/packs` produces this shape from a pack stack, and its
 * `Definition` is assignable here. The content runtime accepts the shape
 * structurally instead of importing it, so a domain can also build types from
 * data that never passed through a pack, such as the Java Edition jar dump
 * behind the block property table.
 */
export interface Definition {
    /** The identifier the definition is registered under, such as `minecraft:stone`. */
    identifier: string;
    /** The registry the definition belongs to, such as `blocks`. */
    registry: string;
    /** The name of the pack the winning definition came from; diagnostics name it. */
    pack: string;
    /** The pack-relative path of the file. */
    path: string;
    /** The parsed definition, replaced whole by a later pack, never merged. */
    data: unknown;
}
