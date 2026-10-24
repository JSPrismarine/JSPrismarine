import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader, NBTTagCompound } from '@jsprismarine/nbt';

/**
 * Loaders for the reference data the repository already carries: the captures under
 * `packages/bedrock-data/src/jsp/` and `packages/minecraft/datagen/snapshot/`, and the
 * CloudburstMC dumps in the resources submodule. Every loader reads a committed file, so the
 * suite needs no network and no server.
 *
 * Later slices add loaders here rather than reading files from their tests: the Java data
 * generator goldens and the GeyserMC mapping tables (plan sections 5 and 6) get loaders beside
 * these once slices 1 through 3 land them.
 */

const require = createRequire(import.meta.url);

/** The directory a workspace package lives in, found through its own package.json export. */
const packageRoot = (name: string): string => dirname(require.resolve(`${name}/package.json`));

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf-8'));

const bedrockDataRoot = packageRoot('@jsprismarine/bedrock-data');
const minecraftRoot = packageRoot('@jsprismarine/minecraft');

/** The block palette capture: the one state capture records per block, and what each property accepts. */
export interface BlockPaletteCapture {
    minecraftVersion: string;
    /** Per block, the property names the network carries with the captured value of each. */
    states: Record<string, Record<string, string | number>>;
    /** Per block, the values the game accepts for each of those properties, with the default. */
    domains: Record<
        string,
        Record<string, { values: (string | number | boolean)[]; default: string | number | boolean }>
    >;
}

/** Reads the block palette captured from a Bedrock Dedicated Server (datagen snapshot). */
export const loadBlockPaletteCapture = (): BlockPaletteCapture =>
    // Parsed JSON has no type the compiler can see; BlockPaletteCapture is its documented shape.
    readJson(join(minecraftRoot, 'datagen/snapshot/block-palette.json')) as BlockPaletteCapture;

/** One item as `required_item_list.json` records it. */
export interface RequiredItemEntry {
    runtime_id: number;
    component_based: boolean;
}

/** Reads the item list captured from a Bedrock Dedicated Server (`ItemRegistryPacket`). */
export const loadRequiredItemList = (): Record<string, RequiredItemEntry> =>
    // Parsed JSON boundary, shape documented above.
    readJson(join(bedrockDataRoot, 'src/jsp/required_item_list.json')) as Record<string, RequiredItemEntry>;

/** One item as the submodule's `runtime_item_states.json` dump records it. */
export interface RuntimeItemState {
    name: string;
    id: number;
    version: number;
    componentBased: boolean;
}

/** Reads the independent item dump from the resources submodule (CloudburstMC, 1.26.50). */
export const loadRuntimeItemStates = (): RuntimeItemState[] =>
    // Parsed JSON boundary, shape documented above.
    readJson(join(bedrockDataRoot, 'src/resources/runtime_item_states.json')) as RuntimeItemState[];

/** One advertised actor type from the entity identifiers golden. */
export interface ActorIdentifier {
    /** The actor type string `AddActorPacket` names, for example `minecraft:zombie`. */
    id: string;
    /** The legacy numeric id (`rid`) the list carries beside it. */
    rid: number;
    hasSpawnEgg: boolean;
    summonable: boolean;
}

/**
 * Decodes the entity identifiers golden, the network NBT `idlist` the server replays as
 * `AvailableActorIdentifiersPacket`.
 */
export const loadActorIdentifiers = (): ActorIdentifier[] => {
    const raw = readFileSync(join(bedrockDataRoot, 'src/resources/entity_identifiers.dat'));
    const reader = new NBTReader(new BinaryStream(raw), ByteOrder.LITTLE_ENDIAN);
    reader.setUseVarint(true);
    const idlist = reader.parse().getList('idlist', false) ?? [];

    const identifiers: ActorIdentifier[] = [];
    for (const entry of idlist) {
        if (!(entry instanceof NBTTagCompound)) continue;
        identifiers.push({
            id: entry.getString('id', ''),
            rid: entry.getNumber('rid', -1),
            hasSpawnEgg: entry.getByte('hasspawnegg', 0) !== 0,
            summonable: entry.getByte('summonable', 0) !== 0
        });
    }
    return identifiers;
};

/** One biome from the submodule's `biome_definitions.json` dump. */
export interface BiomeDefinition {
    temperature: number;
    downfall: number;
}

/** Reads the biome definitions dump from the resources submodule. */
export const loadBiomeDefinitions = (): Record<string, BiomeDefinition> =>
    // Parsed JSON boundary; only the fields the comparisons read are typed.
    readJson(join(bedrockDataRoot, 'src/resources/biome_definitions.json')) as Record<string, BiomeDefinition>;

/** One biome as the captured `BiomeDefinitionListPacket` payload carries it. */
export interface NetworkBiome {
    /** The biome name, resolved through the payload's shared string table. */
    name: string;
    temperature: number;
    downfall: number;
}

/**
 * Decodes the captured `BiomeDefinitionListPacket` payload (protocol 2193): a count of biome
 * definitions keyed into a shared string table, read the way the client reads it. Fields the
 * comparisons do not use are consumed and dropped.
 */
export const loadNetworkBiomes = (): NetworkBiome[] => {
    const raw = readFileSync(join(bedrockDataRoot, 'src/jsp/biome_definitions_network.nbt'));
    const stream = new BinaryStream(raw);

    const biomeCount = stream.readUnsignedVarInt();
    const entries: { key: number; temperature: number; downfall: number }[] = [];
    for (let i = 0; i < biomeCount; i++) {
        const key = stream.readUnsignedShortLE();
        stream.readUnsignedShortLE(); // string table index of the biome's own name field
        const temperature = stream.readFloatLE();
        const downfall = stream.readFloatLE();
        stream.readFloatLE(); // foliage snow
        stream.readFloatLE(); // depth
        stream.readFloatLE(); // scale
        stream.readIntLE(); // map water color
        stream.readBoolean(); // rain
        if (stream.readBoolean()) {
            const tagCount = stream.readUnsignedVarInt();
            for (let t = 0; t < tagCount; t++) stream.readUnsignedShortLE();
        }
        stream.readBoolean(); // chunk generation data, absent in the vanilla capture
        entries.push({ key, temperature, downfall });
    }

    const stringCount = stream.readUnsignedVarInt();
    const strings: string[] = [];
    for (let i = 0; i < stringCount; i++) {
        const length = stream.readUnsignedVarInt();
        strings.push(stream.read(length).toString('utf-8'));
    }

    return entries.map(({ key, temperature, downfall }) => ({
        name: strings[key] ?? `<unresolved string ${key}>`,
        temperature,
        downfall
    }));
};
