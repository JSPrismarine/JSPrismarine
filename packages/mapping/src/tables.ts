/**
 * The vendored tables under `src/tables/`, loaded once and given the shapes
 * the generator guarantees. Everything else in the package reads the tables
 * through this module, so the parsed-JSON boundary is cast exactly once per
 * table.
 */
import blockStatesTableJson from './tables/blockStates.json';
import blocksTableJson from './tables/blocks.json';
import entitiesTableJson from './tables/entities.json';
import itemsTableJson from './tables/items.json';
import javaIdentifiersTableJson from './tables/javaIdentifiers.json';
import registriesTableJson from './tables/registries.json';

/** The generated block table: the target palette and one entry per Java block. */
export interface BlocksTable {
    javaVersion: string;
    bedrockVersion: string;
    geyserMappingsCommit: string;
    /** Bedrock targets grouped per identifier: the short name, the state keys, one value tuple per state. */
    statePalette: [name: string, keys: string[], values: (string | number)[][]][];
    blocks: Record<string, BlockTableEntry>;
}

/** One Java block's slice of the block table. */
export interface BlockTableEntry {
    /** Java property values in alphabetical property order, the state cross product's axis order. */
    properties?: Record<string, string[]>;
    /** In-block index of the block's default state. */
    default: number;
    /** Palette indices in state order, run-length encoded; a bare index is a run of one. */
    targets: (number | [number, number])[];
}

/**
 * The generated state vocabularies: how each Bedrock block spells the state values Java
 * spells as words. `blocks` indexes into `vocabularies`, which the 309 listed blocks share
 * thirty of between them; a block that spells every value Java's way is not listed.
 */
export interface BlockStatesTable {
    javaVersion: string;
    bedrockVersion: string;
    /** Per Bedrock state name, the Bedrock value each Java word spells. */
    vocabularies: Record<string, Record<string, string | number>>[];
    blocks: Record<string, number>;
}

/** The generated item table. */
export interface ItemsTable {
    items: Record<string, { bedrockIdentifier: string; bedrockData?: number }>;
}

/** The generated entity table, with the pinned Bedrock identifier list beside it. */
export interface EntitiesTable {
    entities: Record<string, string>;
    bedrockIdentifiers: string[];
}

/**
 * The generated name-to-name registry tables, with the pinned Bedrock name
 * sets beside them. The keys are the registry names a datapack reference
 * uses, so {@link import('./registryMapping').MappedRegistry} indexes this
 * directly.
 */
export interface RegistriesTable {
    biome: Record<string, string>;
    enchantment: Record<string, string>;
    mob_effect: Record<string, string>;
    potion: Record<string, string>;
    /**
     * The biome inverse: every Bedrock biome by identifier, carrying the numeric id a chunk
     * stores and the Java biome that maps onto it. `java` is absent for the Bedrock biomes no
     * Java biome reaches, which are the reviewed
     * {@link import('./lossList').BEDROCK_BIOME_LOSSES}.
     */
    bedrockBiomes: Record<string, { id: number; java?: string }>;
    bedrock: { enchantment: string[]; mob_effect: string[]; potion: string[] };
}

/**
 * The generated Java identifier census: every entry of the registries no
 * Bedrock table answers, keyed by the registry name a datapack reference
 * uses. {@link import('./packRegistries').SERVER_SIDE_REGISTRIES} and the
 * untranslated rows of {@link import('./lossList').UNTRANSLATED_REGISTRIES}
 * decide which registries appear.
 */
export interface JavaIdentifiersTable {
    javaVersion: string;
    registries: Record<string, string[]>;
}

// The generated tables are data the compiler cannot type beyond the JSON
// imports' unhelpful literals; the generator guarantees these shapes.
/** The block table instance. */
export const blocksTable = blocksTableJson as unknown as BlocksTable;
/** The state vocabulary table instance. */
export const blockStatesTable = blockStatesTableJson as unknown as BlockStatesTable;
/** The item table instance. */
export const itemsTable = itemsTableJson as unknown as ItemsTable;
/** The entity table instance. */
export const entitiesTable = entitiesTableJson as unknown as EntitiesTable;
/** The biome, enchantment, mob effect and potion table instance. */
export const registriesTable = registriesTableJson as unknown as RegistriesTable;
/** The Java identifier census instance. */
export const javaIdentifiersTable = javaIdentifiersTableJson as unknown as JavaIdentifiersTable;
