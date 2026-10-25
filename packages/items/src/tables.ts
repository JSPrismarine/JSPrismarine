/**
 * The vendored item type table under `src/tables/`, loaded once and given the
 * shape the generator guarantees. Everything else in the package reads the
 * table through this module, so the parsed-JSON boundary is cast exactly once.
 */
import itemTypesJson from './tables/itemTypes.json';

/** One Bedrock item identifier's row of the item type table. */
export interface ItemTableRow {
    /** The Java item the components came from. */
    java: string;
    /** The Bedrock damage value that selects this item, present only where one does. */
    data?: number;
    /** Other Java items reaching this identifier, with the damage value that selects each. */
    merged?: { java: string; data?: number }[];
    /** The Java default components, verbatim, keyed by Java component name. */
    components: Record<string, unknown>;
}

/** The generated item type table: Bedrock identities carrying Java-sourced components. */
export interface ItemTypesTable {
    /** The pinned Java Edition version the components came from. */
    javaVersion: string;
    /** The pinned Bedrock Dedicated Server version the identifiers came from. */
    bedrockVersion: string;
    /** Every `minecraft:data_component_type` the pinned Java registry report lists. */
    componentTypes: string[];
    /** How many of the Java items carry each component type as a default. */
    defaultCounts: Record<string, number>;
    /** How many items the Java item registry has. */
    javaItemCount: number;
    /** The Java items the join dropped, which `exceptions.ts` accounts for. */
    exceptedJavaItems: string[];
    /** The `context_int_provider` and `context_float_provider` definitions item components reference. */
    providers: Record<string, unknown>;
    /** One row per Bedrock item identifier. */
    items: Record<string, ItemTableRow>;
}

// The generated table is data the compiler cannot type beyond the JSON
// import's unhelpful literals; the generator guarantees this shape.
/** The item type table instance. */
export const itemTypesTable = itemTypesJson as unknown as ItemTypesTable;
