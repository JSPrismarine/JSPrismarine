import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import BinaryStream from '@jsprismarine/binaryutils';
import type { PortalVectorFile } from '@jsprismarine/block-behaviors/rules/portalVectors';
import { javaServerCacheFolder } from '@jsprismarine/bedrock-data/sources';
import { blockPaletteSnapshotPath } from '@jsprismarine/minecraft/datagen/paths';
import type { ClimateEntry } from '@jsprismarine/worldgen';
import { ByteOrder, NBTReader, NBTTagCompound } from '@jsprismarine/nbt';
import { readCraftingData } from '@jsprismarine/protocol/bedrock/packet/CraftingDataPacket';
import type { CraftingData } from '@jsprismarine/protocol/bedrock/packet/CraftingDataPacket';
import NetworkBinaryStream from '@jsprismarine/protocol/NetworkBinaryStream';

import type { GenerationCorpusGolden } from './generation/golden.ts';
import { GENERATION_CORPUS_FORMAT } from './generation/golden.ts';
import { isRecord } from './isRecord.ts';
import { unpackVanillaDatapack } from './javaDatapack.ts';
import { GENERATION_CORPUS_PATH, REFERENCES, REFERENCE_WORLD_PATH, pinnedJavaDataVersion } from './references.ts';

/**
 * Loaders for the reference data the repository already carries: the captures under
 * `packages/bedrock-data/src/jsp/` and `packages/minecraft/datagen/snapshot/`, both keyed by
 * protocol version, and the fetched `bedrock-samples` checkout, whose loaders take the path its
 * entry in `references.ts` located. No loader needs a network or a server.
 *
 * A comparison that needs reference data gets a loader here rather than reading the file
 * itself, and a loader that reads something a clean checkout may not have gets an entry in
 * `references.ts` so its families report "not measured" instead of failing.
 */

const require = createRequire(import.meta.url);

/** The directory a workspace package lives in, found through its own package.json export. */
const packageRoot = (name: string): string => dirname(require.resolve(`${name}/package.json`));

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf-8'));

const bedrockDataRoot = packageRoot('@jsprismarine/bedrock-data');

/** A path inside the `@jsprismarine/bedrock-data` package, such as `src/jsp`. */
export const bedrockDataPath = (path: string): string => join(bedrockDataRoot, path);

/** The protocol version `sources.json` builds the package's unversioned exports from. */
export const bedrockCaptureProtocol = (): number => {
    // Parsed JSON has no type the compiler can see; this is the one field read here.
    const sources = readJson(join(bedrockDataRoot, 'sources.json')) as { bds: { defaultProtocolVersion: number } };
    return sources.bds.defaultProtocolVersion;
};

/**
 * The Bedrock captures live under a directory per protocol version, the same shape as the
 * datagen snapshots. The comparisons read the version the package builds its unversioned
 * exports from, which `sources.json` names.
 */
export const bedrockCapture = (file: string): string =>
    join(bedrockDataRoot, 'src/jsp', `v${bedrockCaptureProtocol()}`, file);

/** One line the `commands` capture pass typed at the console, and the line the server answered it with. */
export interface CommandAnswer {
    /** The line as typed, without a leading slash. */
    command: string;
    /** `INFO` for a line the server ran, `ERROR` for one it refused. */
    level: 'INFO' | 'ERROR';
    /** What the server printed, without the log prefix. */
    message: string;
}

/** Reads the console answers the `commands` capture pass recorded from the pinned server. */
export const loadCommandAnswers = (): { server: string; answers: CommandAnswer[] } =>
    // Parsed JSON, written by `utils/bedrock-dump/run.ts`'s `commands` pass in this shape.
    readJson(bedrockCapture('command_answers.json')) as { server: string; answers: CommandAnswer[] };

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
export const loadBlockPaletteCapture = (protocol?: number): BlockPaletteCapture =>
    // The datagen manifest decides which protocol version's snapshot the unversioned exports
    // are generated from, and where it sits.
    // Parsed JSON has no type the compiler can see; this is its documented shape.
    readJson(blockPaletteSnapshotPath(protocol)) as BlockPaletteCapture;

/** One item as `required_item_list.json` records it. */
export interface RequiredItemEntry {
    runtime_id: number;
    component_based: boolean;
}

/** Reads the item list captured from a Bedrock Dedicated Server (`ItemRegistryPacket`). */
export const loadRequiredItemList = (): Record<string, RequiredItemEntry> =>
    // Parsed JSON boundary, shape documented above.
    readJson(bedrockCapture('required_item_list.json')) as Record<string, RequiredItemEntry>;

/**
 * Reads the same capture for a protocol version other than the default.
 *
 * The package keeps one capture directory per version and exports the default version's
 * unversioned, so a comparison about a second version has to name it.
 */
export const loadRequiredItemListAt = (protocolVersion: number): Record<string, RequiredItemEntry> =>
    // Parsed JSON boundary, shape documented above.
    readJson(bedrockCaptureAt(protocolVersion, 'required_item_list.json')) as Record<string, RequiredItemEntry>;

/** One file of the capture directory for a named protocol version. */
export const bedrockCaptureAt = (protocolVersion: number, file: string): string =>
    join(bedrockDataRoot, 'src/jsp', `v${protocolVersion}`, file);

/** One item as Mojang's `mojang-items.json` vanilla data module lists it. */
export interface MojangItem {
    name: string;
    /** The numeric id Mojang publishes beside the name, which the item registry should agree with. */
    rawId: number;
}

/**
 * Reads the item list Mojang publishes in `bedrock-samples`, under
 * `metadata/vanilladata_modules/mojang-items.json`. It lists the items a player handles and
 * leaves out the item forms of blocks, so it is a subset of the registry, measured from the
 * game by a different route than the capture.
 *
 * @param samplesRoot - The `bedrock-samples` checkout, from `REFERENCES.bedrockVanillaData`.
 */
export const loadMojangItems = (samplesRoot: string): MojangItem[] => {
    // Parsed JSON boundary; only the two fields read here are typed.
    const module = readJson(join(samplesRoot, 'metadata/vanilladata_modules/mojang-items.json')) as {
        data_items: { name: string; raw_id: number }[];
    };
    return module.data_items.map(({ name, raw_id }) => ({ name, rawId: raw_id }));
};

/** Where the `packets` pass of `dump:bedrock` records the `AvailableActorIdentifiersPacket` payload. */
export const ACTOR_IDENTIFIERS_CAPTURE = 'wire/0x77.bin';

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
 * Decodes the entity identifiers golden, the network NBT `idlist` a Bedrock Dedicated Server
 * sent as `AvailableActorIdentifiersPacket` and this server replays.
 */
export const loadActorIdentifiers = (): ActorIdentifier[] => {
    const raw = readFileSync(bedrockCapture(ACTOR_IDENTIFIERS_CAPTURE));
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

/** The climate one vanilla biome file declares. */
export interface BiomeClimate {
    temperature: number;
    downfall: number;
}

/**
 * Reads the climate of every vanilla biome from the behavior pack Mojang publishes in
 * `bedrock-samples`: one `behavior_pack/biomes/<name>.biome.json` per biome, each declaring
 * `minecraft:climate`. Keyed by the biome's identifier.
 *
 * @param samplesRoot - The `bedrock-samples` checkout, from `REFERENCES.bedrockBehaviorPack`.
 */
export const loadBehaviorPackBiomes = (samplesRoot: string): Record<string, BiomeClimate> => {
    const directory = join(samplesRoot, 'behavior_pack/biomes');
    const biomes: Record<string, BiomeClimate> = {};
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
        // Parsed JSON boundary; only the identifier and the climate are typed.
        const biome = (
            readJson(join(directory, file)) as {
                'minecraft:biome': {
                    description: { identifier: string };
                    components: { 'minecraft:climate'?: Partial<BiomeClimate> };
                };
            }
        )['minecraft:biome'];
        const climate = biome.components['minecraft:climate'] ?? {};
        biomes[biome.description.identifier] = {
            temperature: climate.temperature ?? Number.NaN,
            downfall: climate.downfall ?? Number.NaN
        };
    }
    return biomes;
};

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
    const raw = readFileSync(bedrockCapture('biome_definitions_network.nbt'));
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

const worldgenRoot = packageRoot('@jsprismarine/worldgen');
const blockBehaviorsRoot = packageRoot('@jsprismarine/block-behaviors');

/**
 * Reads the layouts `packages/block-behaviors/utils/oracle` ran Java's `PortalForcer.createPortal`
 * in, with the origin and blocks Java chose in each.
 */
export const loadJavaPortalCreationVectors = (): PortalVectorFile =>
    // Parsed JSON boundary; PortalVectorFile is the dumper's documented shape.
    readJson(join(blockBehaviorsRoot, 'vectors', javaServerCacheFolder, 'portal-creation.json')) as PortalVectorFile;

/** The Java-sourced properties of one block, as the 26.3 jar dumper wrote them. */
export interface JavaBlockPropertyRow {
    /** How many block states Java's registry holds for the block. */
    stateCount: number;
    /** The values every state shares, keyed by the dumper's own property names. */
    base: Record<string, string | number | boolean>;
    /** Per Java state key (`age=3,waterlogged=false`), the fields that state overrides. */
    stateOverrides?: Record<string, Record<string, string | number | boolean>>;
}

/** Reads the default Java release's block property dump. */
export const loadJavaBlockProperties = (): Record<string, JavaBlockPropertyRow> =>
    // Parsed JSON boundary; JavaBlockPropertyRow is the dumper's documented shape.
    readJson(join(bedrockDataRoot, 'src/jsp/java', javaServerCacheFolder, 'block_properties.json')) as Record<
        string,
        JavaBlockPropertyRow
    >;

/** One Java entity type as the 26.3 attribute supplier dump records it. */
export interface JavaEntityAttributeRow {
    /** Java's `MobCategory` name, such as `monster` or `creature`. */
    category: string;
    width: number;
    height: number;
    /** The attribute supplier's base values, keyed by Java attribute identifier. */
    attributes: Record<string, number>;
}

/** Reads the default Java release's attribute supplier dump. */
export const loadJavaEntityAttributes = (): Record<string, JavaEntityAttributeRow> =>
    // Parsed JSON boundary; JavaEntityAttributeRow is the dumper's documented shape.
    readJson(join(bedrockDataRoot, 'src/jsp/java', javaServerCacheFolder, 'entity_attributes.json')) as Record<
        string,
        JavaEntityAttributeRow
    >;

/** One run of identical blocks in a dumped Java column, bottom to top. */
export interface JavaColumnRun {
    y: number;
    count: number;
    /** The Java block identifier the run holds, such as `minecraft:stone`. */
    block: string;
}

/** The Java overworld columns the worldgen oracle dumped, with the settings that produced them. */
export interface JavaColumnVectors {
    seed: number;
    /** The `worldgen/noise_settings` identifier, such as `minecraft:overworld`. */
    settings: string;
    chunkX: number;
    chunkZ: number;
    minY: number;
    height: number;
    columns: { x: number; z: number; runs: JavaColumnRun[] }[];
}

/** `final_density` over one whole chunk as the worldgen oracle dumped it, hashed per 16-block section. */
export interface JavaDensityVolumeChunk {
    /** The `worldgen/noise_settings` identifier, such as `minecraft:overworld`. */
    settings: string;
    chunkX: number;
    chunkZ: number;
    minY: number;
    height: number;
    /** SHA-256 of each section's float bits from `sampleVolume`, the path Java builds terrain from. */
    sampleVolume: string[];
    /** The same hashes from Java's per-block `sampleValue`, which differs in the last bits. */
    sampleValue: string[];
    /** One column's raw float bits from `sampleVolume`, bottom to top. */
    column: { x: number; z: number; bits: number[] };
}

/** Whole-chunk `final_density` for two chunks under each of the seven vanilla noise settings. */
export interface JavaDensityVolumeVectors {
    seed: string;
    chunks: JavaDensityVolumeChunk[];
}

/** Reads the whole-chunk `final_density` hashes the worldgen oracle dumped for seed 1234. */
export const loadJavaDensityVolumes = (): JavaDensityVolumeVectors =>
    // Parsed JSON boundary; JavaDensityVolumeVectors is the dumper's documented shape.
    readJson(join(worldgenRoot, 'vectors', javaServerCacheFolder, 'density-volume.json')) as JavaDensityVolumeVectors;

/** Reads the nine Java overworld columns the worldgen oracle dumped for seed 1234. */
export const loadJavaColumns = (): JavaColumnVectors =>
    // Parsed JSON boundary; JavaColumnVectors is the dumper's documented shape.
    readJson(join(worldgenRoot, 'vectors', javaServerCacheFolder, 'chunk.json')) as JavaColumnVectors;

/** One selected Java spawn block and its containing origin chunk. */
export interface JavaSpawnPosition {
    readonly seed: string;
    readonly block: readonly [number, 0, number];
    readonly chunk: readonly [number, number];
}

/** The Java 26.3 NoiseSpawnFinder outputs captured for the Overworld. */
export interface JavaSpawnVectors {
    readonly settings: string;
    readonly positions: readonly JavaSpawnPosition[];
}

/** Reads the pinned Java server's noise spawn positions. */
export const loadJavaSpawnPositions = (): JavaSpawnVectors =>
    // Parsed JSON boundary; JavaSpawnVectors is the dumper's documented shape.
    readJson(join(worldgenRoot, 'vectors', javaServerCacheFolder, 'spawn.json')) as JavaSpawnVectors;

/** The worldgen registry documents the oracle copied out of the jar, each one a JSON string. */
export interface JavaWorldgenRegistries {
    densityFunctions: Record<string, string>;
    noises: Record<string, string>;
    noiseSettings: Record<string, string>;
    /** The `worldgen/carver` documents, each one compact JSON. */
    carvers: Record<string, string>;
    biomeClimates: Record<string, unknown>;
}

/** Reads Java's density function, noise, noise settings and biome climate registries. */
export const loadJavaWorldgenRegistries = (): JavaWorldgenRegistries =>
    // Parsed JSON boundary; the dumper writes each registry as a map of documents.
    readJson(join(worldgenRoot, 'vectors', javaServerCacheFolder, 'surface-registries.json')) as JavaWorldgenRegistries;

/** Java's climate parameter lists with the biome each sampled target resolves to. */
export interface JavaBiomePointVectors {
    /** Java's own `Climate.quantizeCoord` answers, which are float arithmetic, not double. */
    quantizeCoord: { value: number; quantized: number }[];
    parameterLists: {
        /** The parameter list's identifier, `minecraft:overworld` or `minecraft:nether`. */
        name: string;
        biomes: string[];
        /** One packed point per entry: the biome index, then thirteen bounds, space separated. */
        points: string[];
        /** Sampled climate targets with the biome Java's search tree and a brute scan return. */
        lookups: { target: number[]; tree: string; bruteForce: string }[];
    }[];
    /** Java's end biome at sampled quart positions, which no climate sampler decides. */
    end: { quart: number[]; biome: string }[];
}

/** Reads Java's multi-noise biome lookups, the oracle's own answers for sampled climates. */
export const loadJavaBiomePoints = (): JavaBiomePointVectors =>
    // Parsed JSON boundary; the dumper writes one entry per climate parameter list.
    readJson(join(worldgenRoot, 'vectors', javaServerCacheFolder, 'biome-points.json')) as JavaBiomePointVectors;

/** Overworld cells where two climate boxes tie, and what Java answers with and without history. */
export interface JavaClimateTieVectors {
    seed: string;
    cells: {
        quart: number[];
        /** The quantized climate target at the cell. */
        target: number[];
        /** The biomes the tied boxes belong to. */
        tied: string[];
        /** The answer of a Java thread that has looked nothing up. */
        fresh: string;
        /** The answer after an earlier lookup landed on each tied biome. */
        primed: { primedWith: string; primer: number[]; answer: string }[];
    }[];
}

/** Reads the tie cells the oracle dumped from Java's search tree. */
export const loadJavaClimateTies = (): JavaClimateTieVectors =>
    // Parsed JSON boundary; the dumper writes this file.
    readJson(join(worldgenRoot, 'vectors', javaServerCacheFolder, 'climate-ties.json')) as JavaClimateTieVectors;

/** The biome Java reads a chunk's carvers from, and the jittered biome at the same corner. */
export interface JavaCarverBiomeVectors {
    seed: string;
    firstChunk: number;
    /** Chunks along each side of the window; the lists below hold `chunks * chunks` entries, x major. */
    chunks: number;
    biomes: string[];
    /** Indices into `biomes`: the noise biome at `(chunkX * 4, 0, chunkZ * 4)`. */
    noise: number[];
    /** Indices into `biomes`: `BiomeManager.getBiome` at `(chunkX * 16, 0, chunkZ * 16)`. */
    jittered: number[];
}

/** Reads the carver-selection biomes the oracle dumped for a window of overworld chunks. */
export const loadJavaCarverBiomes = (): JavaCarverBiomeVectors =>
    // Parsed JSON boundary; the dumper writes this file.
    readJson(join(worldgenRoot, 'vectors', javaServerCacheFolder, 'carver-biomes.json')) as JavaCarverBiomeVectors;

/**
 * Unpacks one climate parameter point out of the biome vector file.
 *
 * The oracle writes a point as fourteen space-separated numbers: the index into the file's
 * biome list, then the six parameter spans as min and max pairs, then the offset. Reading it
 * here keeps the format in one place, beside the loader that produces the file's other halves.
 */
export const unpackClimatePoint = (packed: string, biomes: readonly string[]): ClimateEntry<string> => {
    const values = packed.split(' ').map(Number);
    const at = (index: number): number => values[index] ?? 0;
    const span = (index: number) => ({ min: at(index), max: at(index + 1) });
    return {
        point: {
            temperature: span(1),
            humidity: span(3),
            continentalness: span(5),
            erosion: span(7),
            depth: span(9),
            weirdness: span(11),
            offset: at(13)
        },
        value: biomes[at(0)] ?? `<biome index ${at(0)}>`
    };
};

/** One chunk of the reference world, reduced to the digests a parity row compares. */
export interface ReferenceChunkDigest {
    x: number;
    z: number;
    /** 0 needs instaticking, 1 needs population, 2 generated, null when the record is absent. */
    finalizedState: number | null;
    /** sha256 of the 256 stored column heights. */
    heightmap: string;
    /** sha256 of the 3D biome arrays, bottom sub chunk first. */
    biomes: string;
    /** sha256 of the topmost non-air block name per column. */
    surface: string;
    /** sha256 of the chunk's layer 0 block states, keyed through `palette`. */
    blocks: string;
    /** Distinct block identifiers in the chunk, every layer, sorted. */
    palette: string[];
    blockEntities: number;
}

/** One chunk the golden keeps whole, so a failing digest can be read rather than guessed at. */
export interface ReferenceChunkSample {
    x: number;
    z: number;
    /** Column heights above `floor`, in `x * 16 + z` order. */
    heightmap: number[];
    /** Topmost non-air block per column, in the same order. */
    surface: string[];
    /** Biome id at each column's topmost non-air block, in the same order. */
    biomes: number[];
}

/**
 * The reference world golden, as `packages/bedrock-data/utils/bedrock-dump/world.ts` writes it.
 *
 * The file is self-describing: it carries the seed, the dimension and the square of chunks it
 * covers, so a comparison takes the region from the golden rather than repeating the capture
 * job's constants.
 */
export interface ReferenceWorldGolden {
    /** Shape of the file, bumped when a field changes meaning. */
    formatVersion: number;
    /** Bedrock Dedicated Server version the world was generated by. */
    minecraftVersion: string;
    /** `level-seed` the world was generated with. */
    seed: string;
    dimension: string;
    /** Lowest block y, which a sample's heightmap is measured from. */
    floor: number;
    region: { chunkX: number; chunkZ: number; chunksX: number; chunksZ: number };
    chunks: ReferenceChunkDigest[];
    samples: ReferenceChunkSample[];
    /** Blocks of each identifier across the region, layer 0 only. This is the feature count. */
    blockCounts: Record<string, number>;
}

/** The format version of {@link ReferenceWorldGolden} the worldgen rows are written against. */
export const REFERENCE_WORLD_FORMAT = 1;

/**
 * Reads the reference world golden and checks it is the shape the worldgen rows expect.
 *
 * The golden is the one piece of reference data no checkout here can produce, because the
 * capture job runs a Linux x86-64 Bedrock Dedicated Server. A family that needs it declares
 * `REFERENCES.referenceWorld` and never reaches this loader until the file lands; when it does,
 * a shape the rows were not written against fails the row loudly instead of being read wrong.
 *
 * @throws {Error} When the file is absent, or its format version is not the expected one.
 */
export const loadReferenceWorld = (): ReferenceWorldGolden => {
    const path = REFERENCES.referenceWorld.locate();
    if (path === undefined) throw new Error('the reference world golden is not in this checkout');

    // Parsed JSON boundary; the fields are checked below before anything reads them.
    const golden = readJson(path) as ReferenceWorldGolden;
    if (golden.formatVersion !== REFERENCE_WORLD_FORMAT) {
        throw new Error(
            `${REFERENCE_WORLD_PATH} is format version ${golden.formatVersion}, and the worldgen rows are ` +
                `written against ${REFERENCE_WORLD_FORMAT}. Reread packages/bedrock-data/README.md under "The ` +
                'reference world" and update the rows before trusting them.'
        );
    }
    if (!Array.isArray(golden.chunks) || golden.chunks.length === 0 || typeof golden.blockCounts !== 'object') {
        throw new Error(`${REFERENCE_WORLD_PATH} carries no chunks or no block histogram`);
    }

    return golden;
};

/**
 * Reads the generation corpus golden and checks it is the shape and the vintage the rows expect.
 *
 * Two things can make the file unreadable rather than merely different. A format version the
 * rows were not written against means a field may have changed meaning, and a Java data version
 * other than the one the capture ran against means every block in the file was generated from
 * different inputs. Both throw with what to do, because a corpus row that quietly compared a
 * stale recording would be worse than no row.
 *
 * @throws {Error} When the file is absent, its format version is not
 *   {@link GENERATION_CORPUS_FORMAT}, or it was captured against a different Java data version.
 */
export const loadGenerationCorpus = (): GenerationCorpusGolden => {
    const path = REFERENCES.generationCorpus.locate();
    if (path === undefined) {
        throw new Error(
            `${GENERATION_CORPUS_PATH} is not in this checkout; run ` +
                '`pnpm --filter @jsprismarine/parity run capture:corpus` to write it'
        );
    }

    // Parsed JSON boundary; the fields are checked below before anything reads them.
    const golden = readJson(path) as GenerationCorpusGolden;
    if (golden.formatVersion !== GENERATION_CORPUS_FORMAT) {
        throw new Error(
            `${GENERATION_CORPUS_PATH} is format version ${golden.formatVersion}, and the worldgen rows are ` +
                `written against ${GENERATION_CORPUS_FORMAT}. Reread packages/parity/README.md under "The ` +
                'generation corpus" and update the rows before trusting them.'
        );
    }

    const pinned = pinnedJavaDataVersion();
    if (pinned !== undefined && golden.provenance.javaVersion !== pinned) {
        throw new Error(
            `${GENERATION_CORPUS_PATH} was captured against Java ${golden.provenance.javaVersion} and this ` +
                `checkout pins Java ${pinned}. The generator reads that data, so the corpus is stale: ` +
                'recapture it with `pnpm --filter @jsprismarine/parity run capture:corpus`.'
        );
    }

    if (golden.chunks.length === 0 || golden.samples.length === 0) {
        throw new Error(`${GENERATION_CORPUS_PATH} carries no chunks or no whole-chunk sample`);
    }

    return golden;
};

/** The cooking recipe types a furnace, blast furnace or smoker makes. */
const FURNACE_RECIPE_TYPES = ['minecraft:smelting', 'minecraft:blasting', 'minecraft:smoking'] as const;

/** One furnace recipe of Java's vanilla datapack, read from its own file. */
export interface JavaFurnaceRecipe {
    /** The recipe id, as `minecraft:<file name>`. */
    readonly id: string;
    readonly type: (typeof FURNACE_RECIPE_TYPES)[number];
    /** The recipe's `experience`, which Java's codec defaults to 0 when the file leaves it out. */
    readonly experience: number;
    /** Every Java item the ingredient accepts, with each `#tag` read from the datapack's item tags. */
    readonly items: readonly string[];
}

/** The items an item tag of the vanilla datapack lists, following the tags it names. */
const javaItemTagMembers = (datapack: string, tag: string, seen = new Set<string>()): string[] => {
    if (seen.has(tag)) return [];
    seen.add(tag);
    const parsed = readJson(
        join(datapack, 'data', 'minecraft', 'tags', 'item', `${tag.replace(/^minecraft:/, '')}.json`)
    );
    const values = isRecord(parsed) && Array.isArray(parsed['values']) ? parsed['values'] : [];
    return values.flatMap((value: unknown) => {
        const entry = isRecord(value) ? value['id'] : value;
        if (typeof entry !== 'string') return [];
        return entry.startsWith('#') ? javaItemTagMembers(datapack, entry.slice(1), seen) : [entry];
    });
};

/**
 * Reads every furnace, blast furnace and smoker recipe out of the pinned Java release's vanilla
 * datapack, independently of the server's own recipe loader.
 */
export const loadJavaFurnaceRecipes = (): JavaFurnaceRecipe[] => {
    const datapack = unpackVanillaDatapack();
    const root = join(datapack, 'data', 'minecraft', 'recipe');
    return readdirSync(root)
        .filter((file) => file.endsWith('.json'))
        .sort()
        .flatMap((file): JavaFurnaceRecipe[] => {
            const parsed = readJson(join(root, file));
            if (!isRecord(parsed)) return [];
            const type = FURNACE_RECIPE_TYPES.find((candidate) => candidate === parsed['type']);
            if (type === undefined) return [];
            const ingredient = parsed['ingredient'];
            const names = (Array.isArray(ingredient) ? ingredient : [ingredient]).filter(
                (name): name is string => typeof name === 'string'
            );
            const experience = parsed['experience'];
            return [
                {
                    id: `minecraft:${file.slice(0, -'.json'.length)}`,
                    type,
                    experience: typeof experience === 'number' ? experience : 0,
                    items: names.flatMap((name) =>
                        name.startsWith('#') ? javaItemTagMembers(datapack, name.slice(1)) : [name]
                    )
                }
            ];
        });
};

/** The `CraftingData` the pinned Bedrock Dedicated Server sent a joining client. */
export const loadCraftingDataCapture = (): CraftingData =>
    readCraftingData(new NetworkBinaryStream(readFileSync(bedrockCapture('wire/0x34.bin'))));
