/**
 * Generates the vendored mapping tables under `src/tables/<release>/` from the
 * pinned sources (plan section 5, decision 4): the GeyserMC/mappings join for
 * blocks and items, Mojang's Java data generator reports for the Java side,
 * this repository's own BDS captures for the Bedrock side, and the
 * bedrock-samples metadata for biome and enchantment names.
 *
 * `--java <release>` picks the Java release, the default when absent. The
 * Bedrock side is the protocol `sources.json` pairs with that release
 * (`javaBedrockPairs`): its `jsp/v<protocol>/` capture and its block palette
 * snapshot. `pair.json` beside the tables records the pair.
 *
 * Run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` and then
 * `datagen:java --java <release>` first; they populate
 * `node_modules/.cache/jsprismarine/`. This script reads the vanilla datapack
 * and the data reports where `datagen:java` lays them out, and never runs the
 * Java data generator itself.
 *
 * GeyserMC's tables are made for one Java release, `geyserMappings.javaVersion`
 * in `sources.json`. For a newer release, the block states and identifiers
 * that release shares with Geyser's are joined through Geyser's own release's
 * reports, and the ones it adds are read through the reviewed rules in
 * `BLOCKS_AFTER_GEYSER` and the same-name fallback the item and biome joins
 * describe.
 *
 * The generator refuses to emit when any Java identifier has neither a
 * mapping nor a reviewed loss entry, and when any produced Bedrock block
 * state is not in the pinned palette. Every refusal is a thrown error.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blockPaletteSnapshotPath } from '@jsprismarine/minecraft/datagen/paths';

// The pair resolver of the package that owns `sources.json`; generator scripts are not published.
import { compareJavaReleases } from '../../../bedrock-data/utils/fetch/manifest.ts';
import { resolveJavaBedrockPair } from '../../../bedrock-data/utils/java/release.ts';
import { worldgenCachePaths } from '../../../bedrock-data/utils/java/worldgen-cache.ts';

import type { BedrockBiomeLoss } from '../../src/lossList.ts';
import { BEDROCK_BIOME_LOSSES, ENTITY_LOSSES, REGISTRY_LOSSES, UNTRANSLATED_REGISTRIES } from '../../src/lossList.ts';
import { SERVER_SIDE_REGISTRIES } from '../../src/packRegistries.ts';
import type { JavaNbtCompound } from './java-nbt.ts';
import { readGzippedJavaNbt } from './java-nbt.ts';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(packageDir, '../..');
const cacheRoot = join(repoRoot, 'node_modules/.cache/jsprismarine');
const pair = resolveJavaBedrockPair(process.argv);
const tablesDir = join(packageDir, 'src/tables', pair.java);

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

// ---------------------------------------------------------------------------
// Pinned sources
// ---------------------------------------------------------------------------

interface SourcesManifest {
    bedrockSamples: { tag: string; commit: string };
    geyserMappings: { commit: string; javaVersion: string };
}

// sources.json is parsed JSON; only the pins the generator reads are typed.
const sources = readJson(join(repoRoot, 'packages/bedrock-data/sources.json')) as SourcesManifest;
const javaVersion = pair.java;
const geyserCommit = sources.geyserMappings.commit;
const geyserJavaVersion = sources.geyserMappings.javaVersion;

const geyserDir = join(cacheRoot, 'geyser-mappings', geyserCommit, 'unpacked', `mappings-${geyserCommit}`);
const samplesDir = join(
    cacheRoot,
    'bedrock-samples',
    sources.bedrockSamples.tag,
    'unpacked',
    `bedrock-samples-${sources.bedrockSamples.commit}`,
    'metadata/vanilladata_modules'
);
for (const required of [geyserDir, samplesDir]) {
    if (!existsSync(required)) {
        throw new Error(
            `${required} is missing. Run \`pnpm --filter @jsprismarine/bedrock-data run fetch:sources\` first.`
        );
    }
}

// ---------------------------------------------------------------------------
// The Java data generator output, as `datagen:java` lays it out
// ---------------------------------------------------------------------------

/** Where one Java release's data reports and vanilla datapack are. */
interface JavaGeneratedData {
    /** The data generator output root, the directory holding `reports/`. */
    reports: string;
    /** The vanilla datapack root, the directory holding `data/`. */
    datapack: string;
}

/**
 * The data generator output of one Java release, which `datagen:java` writes.
 *
 * The generator's own output directory belongs to `datagen:java`, which sorts the reports it
 * installs, so this script never runs the generator into it.
 *
 * @param release - A Java release id `sources.json` pins.
 * @returns The roots the reports and the datapack are under.
 */
const javaGeneratedData = (release: string): JavaGeneratedData => {
    const { reports, datapack } = worldgenCachePaths(release, cacheRoot);
    // Every input read below, so a missing one fails here with the fix rather than later on a
    // missing directory.
    const inputs = [
        join(reports, 'reports/blocks.json'),
        join(reports, 'reports/registries.json'),
        join(datapack, 'data/minecraft/worldgen/biome'),
        join(datapack, 'data/minecraft/enchantment')
    ];
    const missing = inputs.find((input) => !existsSync(input));
    if (missing !== undefined) {
        throw new Error(
            `${missing} is missing. Run \`pnpm --filter @jsprismarine/bedrock-data run datagen:java --java ${release}\` first.`
        );
    }
    return { reports, datapack };
};
const javaData = javaGeneratedData(javaVersion);

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

interface JavaBlockState {
    id: number;
    default?: boolean;
    properties?: Record<string, string>;
}
interface JavaBlock {
    properties?: Record<string, string[]>;
    states: JavaBlockState[];
}
// Mojang's reports are parsed JSON the compiler cannot see the shape of.
const readJavaBlocks = (directory: string): Record<string, JavaBlock> =>
    readJson(join(directory, 'reports/blocks.json')) as Record<string, JavaBlock>;
const javaBlocks = readJavaBlocks(javaData.reports);
/** The blocks of the Java release GeyserMC's `blocks.nbt` is positional over. */
const geyserJavaBlocks =
    geyserJavaVersion === javaVersion ? javaBlocks : readJavaBlocks(javaGeneratedData(geyserJavaVersion).reports);
const javaRegistries = readJson(join(javaData.reports, 'reports/registries.json')) as Record<
    string,
    { entries: Record<string, unknown> }
>;

interface PaletteFile {
    minecraftVersion: string;
    /** Per block, the state keys (and defaults) the network carries. */
    states: Record<string, Record<string, string | number>>;
    /** Per block, every value the game accepts for each property it knows, including legacy ones. */
    domains: Record<string, Record<string, { values: (string | number | boolean)[] }>>;
}
// The repository's own BDS capture; see packages/minecraft/datagen/README-palette.md.
const palette = readJson(blockPaletteSnapshotPath(pair.protocol)) as PaletteFile;
const bedrockVersion = palette.minecraftVersion;

interface GeyserBlockEntry {
    bedrock_identifier?: string;
    state?: Record<string, string | number>;
}
const geyserBlocks = readGzippedJavaNbt(readFileSync(join(geyserDir, 'blocks.nbt')));

interface GeyserItemEntry {
    bedrock_identifier: string;
    bedrock_data?: number;
}
const geyserItems = readJson(join(geyserDir, 'items.json')) as Record<string, GeyserItemEntry>;
const geyserBiomes = readJson(join(geyserDir, 'biomes.json')) as Record<string, { bedrock_id: number }>;

interface VanillaDataModule {
    data_items: { id?: number; name: string }[];
}
const bedrockBiomes = readJson(join(samplesDir, 'mojang-biomes.json')) as VanillaDataModule;
const bedrockEnchantments = readJson(join(samplesDir, 'mojang-enchantments.json')) as VanillaDataModule;
const bedrockMobEffects = readJson(join(samplesDir, 'mojang-effects.json')) as VanillaDataModule;
const bedrockPotions = readJson(join(samplesDir, 'mojang-potion-effects.json')) as VanillaDataModule;

// The Bedrock captures are keyed by protocol version; the tables are generated from the
// protocol `sources.json` pairs with the Java release.
const bedrockItemTable = readJson(
    join(repoRoot, 'packages/bedrock-data/src/jsp', `v${pair.protocol}`, 'required_item_list.json')
) as Record<string, unknown>;

const entityIdentifiersPath = join(
    repoRoot,
    'packages/bedrock-data/src/generated',
    `v${pair.protocol}`,
    'entity_identifiers.json'
);
if (!existsSync(entityIdentifiersPath)) {
    throw new Error(
        `${entityIdentifiersPath} is missing. Run \`pnpm --filter @jsprismarine/bedrock-data run generate\`.`
    );
}
const entityIdentifiersNbt = Buffer.from(
    // The capture is parsed JSON holding one base64 field.
    (readJson(entityIdentifiersPath) as { data: string }).data,
    'base64'
);
/**
 * The identifier strings inside `AvailableActorIdentifiersPacket` NBT. The
 * file is not a plain NBT flavor this repository parses, so the identifiers
 * are pulled by pattern, the way the research note measured them.
 */
const bedrockEntities = new Set(entityIdentifiersNbt.toString('latin1').match(/minecraft:[a-z0-9_.]+/g));

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Bedrock state values travel as strings and ints; booleans normalize to 0 and 1. */
const normalize = (value: string | number | boolean): string | number =>
    typeof value === 'boolean' ? Number(value) : value;

/** Canonical one-line form of a Bedrock block state, used as the palette entry. */
const canonical = (name: string, states: Record<string, string | number>): string => {
    const body = Object.keys(states)
        .sort()
        .map((key) => `${key}=${states[key]}`)
        .join(',');
    return body === '' ? name : `${name}[${body}]`;
};

const notice = (what: string): string[] => [
    `Generated by utils/generate/generate-tables.ts. Do not edit; regenerate with`,
    `\`pnpm --filter @jsprismarine/mapping run generate:tables\`.`,
    '',
    what,
    '',
    'Derived from GeyserMC/mappings (MIT, Copyright (c) 2019-2026 GeyserMC,',
    'http://geysermc.org); see the NOTICE file beside this package for the full',
    'license text and scope. GeyserMC does not relicense Minecraft, its data, or',
    'any other material owned by Mojang or Microsoft, and neither does this file.'
];

/**
 * Renders JSON with the two outer levels pretty-printed and everything deeper
 * minified, so each palette entry and each block lands on its own line and a
 * version bump diffs by entry.
 */
const render = (value: unknown, depth: number, indent: string): string => {
    if (depth === 0 || value === null || typeof value !== 'object') return JSON.stringify(value);
    const inner = `${indent}    `;
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        return `[\n${value.map((item) => inner + render(item, depth - 1, inner)).join(',\n')}\n${indent}]`;
    }
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    return `{\n${entries
        .map(([key, item]) => `${inner}${JSON.stringify(key)}: ${render(item, depth - 1, inner)}`)
        .join(',\n')}\n${indent}}`;
};

const writeTable = (fileName: string, table: object): void => {
    mkdirSync(tablesDir, { recursive: true });
    const path = join(tablesDir, fileName);
    writeFileSync(path, `${render(table, 2, '')}\n`);
    console.log(`Wrote ${path}`);
};

// ---------------------------------------------------------------------------
// Blocks: the positional blocks.nbt joined against reports/blocks.json
// ---------------------------------------------------------------------------

const mappingList = geyserBlocks['bedrock_mappings'];
if (!Array.isArray(mappingList)) throw new Error('blocks.nbt has no bedrock_mappings list');

// The join is positional: entry i belongs to state id i of Geyser's Java
// release, and that release's reports/blocks.json supplies the ordering. The
// report lists blocks alphabetically while ids follow registry order, so each
// block's ids are verified against its own first id. The lookup arithmetic
// also needs each block's states in cross-product order, so that is verified
// too, for the release the tables are generated for.
const blockNames = Object.keys(javaBlocks);
for (const name of blockNames) {
    const block = javaBlocks[name];
    if (!block) continue;
    const firstId = block.states[0]?.id ?? 0;
    // State ids follow the cross product over the properties in alphabetical
    // order, the last one varying fastest; the report's `properties` object
    // lists declaration order instead.
    const propertyNames = Object.keys(block.properties ?? {}).sort();
    const propertyValues = propertyNames.map((property) => block.properties?.[property] ?? []);
    block.states.forEach((state, index) => {
        if (state.id !== firstId + index) {
            throw new Error(`${name}: state ids are not contiguous at ${state.id}`);
        }
        // Cross-product order: the last declared property varies fastest.
        let computed = 0;
        for (let axis = 0; axis < propertyNames.length; axis++) {
            const propertyName = propertyNames[axis] ?? '';
            const values = propertyValues[axis] ?? [];
            const value = state.properties?.[propertyName];
            const valueIndex = value === undefined ? -1 : values.indexOf(value);
            if (valueIndex < 0) throw new Error(`${name}: state ${state.id} has no value for ${propertyName}`);
            computed = computed * values.length + valueIndex;
        }
        if (computed !== index) {
            throw new Error(`${name}: state ${state.id} is not in cross-product order`);
        }
    });
}
const geyserStateCount = Object.values(geyserJavaBlocks).reduce((total, block) => total + block.states.length, 0);
if (geyserStateCount !== mappingList.length) {
    throw new Error(
        `Java ${geyserJavaVersion} reports ${geyserStateCount} states but blocks.nbt has ${mappingList.length} entries`
    );
}

/** Geyser's entries by Java state, so a newer release's states find theirs by name and properties. */
const geyserEntries = new Map<string, JavaNbtCompound>();
for (const [name, block] of Object.entries(geyserJavaBlocks)) {
    for (const state of block.states) {
        const entry = mappingList[state.id];
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            throw new Error(`${name}: blocks.nbt entry ${state.id} is not a compound`);
        }
        geyserEntries.set(canonical(name, state.properties ?? {}), entry);
    }
}

/** How a Java block state newer than Geyser's release is mapped: through a block Geyser maps. */
interface BlockAfterGeyser {
    /**
     * The Java block of Geyser's release whose mapping this block shares. Every property it has,
     * this block has with the same values, so each state of this block reads the template state
     * with the same values.
     */
    readonly like: string;
    /**
     * Replaces the first `from` in the template's Bedrock identifier with `to`. Absent when the
     * block maps onto the template's own Bedrock block.
     */
    readonly rename?: readonly [from: string, to: string];
    /** The Java properties the template lacks. Each is dropped, unless `STATES_FROM_JAVA` reads it. */
    readonly extra?: readonly string[];
}

/** The slab, stairs and wall of one new stone-like material, shaped like the stone brick ones. */
const stoneFamily = (material: string): Record<string, BlockAfterGeyser> => ({
    [`minecraft:${material}_slab`]: { like: 'minecraft:stone_brick_slab', rename: ['stone_brick', material] },
    [`minecraft:${material}_stairs`]: { like: 'minecraft:stone_brick_stairs', rename: ['stone_brick', material] },
    [`minecraft:${material}_wall`]: { like: 'minecraft:stone_brick_wall', rename: ['stone_brick', material] }
});

/** A new block with no properties, on a Bedrock block of the same name with no states. */
const plainBlock = (name: string): BlockAfterGeyser => ({ like: 'minecraft:stone', rename: ['stone', name] });

/**
 * The Java blocks and states newer than GeyserMC's release, each mapped through a block Geyser
 * maps. Every one was checked against the Bedrock block of the paired palette: the template's
 * Bedrock block has the states the new one has, so `targetOf` validating the result against the
 * palette is what keeps a wrong template from passing.
 *
 * 26.4 adds 25 blocks, every one of which Bedrock 2259 has under the same name, and gives the
 * jukebox a `playlist_mode` property Bedrock's jukebox has no state for.
 */
const BLOCKS_AFTER_GEYSER: Readonly<Record<string, BlockAfterGeyser>> = {
    'minecraft:brittle_ice': { like: 'minecraft:frosted_ice', rename: ['frosted_ice', 'brittle_ice'] },
    'minecraft:calcite_pillar': { like: 'minecraft:purpur_pillar', rename: ['purpur', 'calcite'] },
    'minecraft:chiseled_packed_ice': plainBlock('chiseled_packed_ice'),
    'minecraft:chiseled_soulshale': plainBlock('chiseled_soulshale'),
    'minecraft:ice_crystal': { like: 'minecraft:amethyst_cluster', rename: ['amethyst_cluster', 'ice_crystal'] },
    // Bedrock's icicle is pointed dripstone with one more state, which `STATES_FROM_JAVA` reads.
    'minecraft:icicle': {
        like: 'minecraft:pointed_dripstone',
        rename: ['pointed_dripstone', 'icicle'],
        extra: ['attached']
    },
    'minecraft:jukebox': { like: 'minecraft:jukebox', extra: ['playlist_mode'] },
    'minecraft:packed_ice_bricks': plainBlock('packed_ice_bricks'),
    'minecraft:polished_calcite': plainBlock('polished_calcite'),
    'minecraft:polished_calcite_bricks': plainBlock('polished_calcite_bricks'),
    'minecraft:snow_bricks': plainBlock('snow_bricks'),
    ...stoneFamily('calcite'),
    ...stoneFamily('packed_ice_brick'),
    ...stoneFamily('polished_calcite'),
    ...stoneFamily('polished_calcite_brick'),
    ...stoneFamily('snow_brick')
};

/** Checks that a rule's template has a subset of the block's properties, with the same values. */
const checkBlockAfterGeyser = (name: string, rule: BlockAfterGeyser): void => {
    const own = javaBlocks[name]?.properties ?? {};
    const template = geyserJavaBlocks[rule.like];
    if (template === undefined)
        throw new Error(`${name}: template ${rule.like} is not a Java ${geyserJavaVersion} block`);
    const templateProperties = template.properties ?? {};
    for (const [property, values] of Object.entries(templateProperties)) {
        if ([...(own[property] ?? [])].sort().join() !== [...values].sort().join()) {
            throw new Error(`${name}: ${property} does not take the values it takes on ${rule.like}`);
        }
    }
    for (const property of Object.keys(own)) {
        if (!(property in templateProperties) && !(rule.extra ?? []).includes(property)) {
            throw new Error(`${name}: ${property} is not on ${rule.like}; list it under the rule's extra`);
        }
    }
};

const usedRules = new Set<string>();
/** The Geyser entry one Java state maps through: its own, or its rule's template state's. */
const geyserEntryOf = (name: string, properties: Record<string, string>): JavaNbtCompound => {
    const own = geyserEntries.get(canonical(name, properties));
    if (own !== undefined) return own;
    const rule = BLOCKS_AFTER_GEYSER[name];
    if (rule === undefined) {
        throw new Error(
            `${canonical(name, properties)} is not in GeyserMC's Java ${geyserJavaVersion} table and BLOCKS_AFTER_GEYSER has no rule for ${name}`
        );
    }
    if (!usedRules.has(name)) checkBlockAfterGeyser(name, rule);
    usedRules.add(name);
    const templateProperties = Object.fromEntries(
        Object.keys(geyserJavaBlocks[rule.like]?.properties ?? {}).map((property) => [
            property,
            properties[property] ?? ''
        ])
    );
    const template = geyserEntries.get(canonical(rule.like, templateProperties));
    if (template === undefined)
        throw new Error(`${name}: ${rule.like} has no state ${canonical(rule.like, templateProperties)}`);
    if (rule.rename === undefined) return template;
    // The NBT entry carries at most `bedrock_identifier` and `state`.
    const templateName = (template as GeyserBlockEntry).bedrock_identifier ?? rule.like.split(':', 2)[1] ?? '';
    const [from, to] = rule.rename;
    if (!templateName.includes(from))
        throw new Error(`${name}: ${rule.like} maps to ${templateName}, which has no ${from}`);
    return { ...template, bedrock_identifier: templateName.replace(from, to) };
};

interface PaletteState {
    name: string;
    states: Record<string, string | number>;
}

/**
 * Bedrock states the pinned palette declares and the Geyser table does not produce, each read off
 * the Java property of the same meaning, by Bedrock identifier.
 *
 * Geyser's `blocks.nbt` targets the oldest Bedrock release Geyser supports and adds the states a
 * newer release brought in code. 1.26.60 gave three blocks the connection states Java has always
 * had, so each value here is the Java state's own: `true` and `false` become the bits Bedrock
 * stores, and redstone's `none`, `side` and `up` carry over as they are. The 1.26.70 preview gave
 * both repeaters `locked` and scaffolding `bottom`, which Java has always had too.
 *
 * A state is read only for a palette that declares it, so one table serves the Bedrock releases
 * before and after the state arrived.
 */
const STATES_FROM_JAVA: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    'minecraft:chorus_plant': {
        'minecraft:connection_down': 'down',
        'minecraft:connection_east': 'east',
        'minecraft:connection_north': 'north',
        'minecraft:connection_south': 'south',
        'minecraft:connection_up': 'up',
        'minecraft:connection_west': 'west'
    },
    // Bedrock's icicle hangs on to a block below it the way Java's does.
    'minecraft:icicle': { attached_bit: 'attached' },
    'minecraft:fire': {
        'minecraft:connection_east': 'east',
        'minecraft:connection_north': 'north',
        'minecraft:connection_south': 'south',
        'minecraft:connection_up': 'up',
        'minecraft:connection_west': 'west'
    },
    'minecraft:powered_repeater': { locked: 'locked' },
    'minecraft:redstone_wire': {
        redstone_east: 'east',
        redstone_north: 'north',
        redstone_south: 'south',
        redstone_west: 'west'
    },
    'minecraft:scaffolding': { bottom: 'bottom' },
    'minecraft:unpowered_repeater': { locked: 'locked' }
};

/** A Java state value as Bedrock stores it: a boolean is a bit, anything else is unchanged. */
const fromJava = (value: string): string | number => (value === 'true' ? 1 : value === 'false' ? 0 : value);

/** Distinct Bedrock target states by canonical form, in first-seen order. */
const targetStates = new Map<string, PaletteState>();
const targetOf = (javaName: string, entry: JavaNbtCompound, javaState: Record<string, string> = {}): string => {
    // The NBT entry carries at most `bedrock_identifier` and `state`.
    const typed = entry as GeyserBlockEntry;
    const bedrockName = `minecraft:${typed.bedrock_identifier ?? javaName.split(':', 2)[1]}`;
    const states: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(typed.state ?? {})) {
        if (typeof value !== 'string' && typeof value !== 'number') {
            throw new Error(`${javaName}: non-scalar state value for ${key}`);
        }
        if (typeof value === 'string' && !/^[a-z0-9_]+$/.test(value)) {
            throw new Error(`${javaName}: state value ${value} does not fit the canonical form`);
        }
        states[key] = normalize(value);
    }
    for (const [key, javaProperty] of Object.entries(STATES_FROM_JAVA[bedrockName] ?? {})) {
        if (!(key in (palette.states[bedrockName] ?? {}))) continue;
        const value = javaState[javaProperty];
        if (value === undefined) throw new Error(`${javaName} has no ${javaProperty} for ${bedrockName}'s ${key}`);
        if (key in states) throw new Error(`${javaName}: the Geyser table already carries ${key}; drop the rule`);
        states[key] = fromJava(value);
    }

    // Refuse to emit a state the pinned palette does not have.
    const declaredKeys = palette.states[bedrockName];
    const domains = palette.domains[bedrockName];
    if (declaredKeys === undefined || domains === undefined) {
        throw new Error(`${javaName} maps to ${bedrockName}, which is not in the ${bedrockVersion} palette`);
    }
    const declared = Object.keys(declaredKeys).sort();
    const produced = Object.keys(states).sort();
    if (declared.join() !== produced.join()) {
        throw new Error(`${javaName} maps to ${bedrockName} with states [${produced}], palette declares [${declared}]`);
    }
    for (const [key, value] of Object.entries(states)) {
        const domain = domains[key]?.values.map(normalize) ?? [];
        if (!domain.includes(value)) {
            throw new Error(`${javaName} maps to ${bedrockName} with ${key}=${value}, outside [${domain}]`);
        }
    }

    const canonicalForm = canonical(bedrockName, states);
    if (!targetStates.has(canonicalForm)) targetStates.set(canonicalForm, { name: bedrockName, states });
    return canonicalForm;
};

// First pass: resolve every Java state to its canonical Bedrock target.
const canonicalByStateId: string[] = [];
for (const name of blockNames) {
    const block = javaBlocks[name];
    if (!block) continue;
    for (const state of block.states) {
        canonicalByStateId[state.id] = targetOf(name, geyserEntryOf(name, state.properties ?? {}), state.properties);
    }
}
if (javaVersion !== geyserJavaVersion) {
    const unused = Object.keys(BLOCKS_AFTER_GEYSER).filter((name) => !usedRules.has(name));
    if (unused.length > 0) throw new Error(`BLOCKS_AFTER_GEYSER rules no Java ${javaVersion} state needs: ${unused}`);
}

// The palette groups the distinct targets by Bedrock identifier so the name
// and the state keys are written once per identifier. A flat index is the
// group-flattened position, assigned here.
type PaletteGroup = [name: string, keys: string[], values: (string | number)[][]];
const paletteGroups = new Map<string, PaletteGroup>();
const paletteIndex = new Map<string, number>();
for (const [canonicalForm, target] of targetStates) {
    const keys = Object.keys(target.states).sort();
    let group = paletteGroups.get(target.name);
    if (group === undefined) {
        group = [target.name.replace(/^minecraft:/, ''), keys, []];
        paletteGroups.set(target.name, group);
    }
    group[2].push(keys.map((key) => target.states[key] ?? ''));
    paletteIndex.set(canonicalForm, -1);
}
{
    let flatIndex = 0;
    for (const [name, group] of paletteGroups) {
        for (const values of group[2]) {
            const states = Object.fromEntries(group[1].map((key, axis) => [key, values[axis] ?? '']));
            paletteIndex.set(canonical(name, states), flatIndex);
            flatIndex += 1;
        }
    }
}

interface BlockTableEntry {
    properties?: Record<string, string[]>;
    default: number;
    /** Palette indices in state order, run-length encoded: a bare index is a run of one. */
    targets: (number | [number, number])[];
}
const blocksTable: Record<string, BlockTableEntry> = {};
for (const name of blockNames) {
    const block = javaBlocks[name];
    if (!block) continue;
    const targets: (number | [number, number])[] = [];
    let defaultIndex = 0;
    block.states.forEach((state, index) => {
        if (state.default) defaultIndex = index;
        const target = paletteIndex.get(canonicalByStateId[state.id] ?? '');
        if (target === undefined || target < 0) throw new Error(`${name}: state ${state.id} has no palette index`);
        const last = targets[targets.length - 1];
        if (Array.isArray(last) && last[0] === target) last[1] += 1;
        else if (typeof last === 'number' && last === target) targets[targets.length - 1] = [target, 2];
        else targets.push(target);
    });
    const entry: BlockTableEntry = { default: defaultIndex, targets };
    if (block.properties) {
        // Alphabetical property order, matching the state-id cross product the
        // lookup arithmetic walks.
        entry.properties = Object.fromEntries(
            Object.keys(block.properties)
                .sort()
                .map((property) => [property, block.properties?.[property] ?? []])
        );
    }
    blocksTable[name] = entry;
}

writeTable('blocks.json', {
    $notice: notice(
        `Java ${javaVersion} block states to Bedrock ${bedrockVersion} block states: GeyserMC blocks.nbt (commit ${geyserCommit}), positional over Java state ids, joined against Mojang's reports/blocks.json and validated against this repository's BDS palette capture.`
    ),
    javaVersion,
    bedrockVersion,
    geyserMappingsCommit: geyserCommit,
    statePalette: [...paletteGroups.values()],
    blocks: blocksTable
});

// ---------------------------------------------------------------------------
// Items: GeyserMC items.json, validated against the BDS item table capture
// ---------------------------------------------------------------------------

/**
 * Whether a Java identifier Geyser has no entry for may fall back to the Bedrock identifier of the
 * same name: only when the tables are for a release newer than Geyser's, which is where an
 * identifier Geyser has never seen comes from. The caller still checks that the pinned Bedrock
 * side has the name.
 */
const sameNameAfterGeyser = javaVersion !== geyserJavaVersion;

const javaItems = Object.keys(javaRegistries['minecraft:item']?.entries ?? {}).sort();
const itemsTable: Record<string, { bedrockIdentifier: string; bedrockData?: number }> = {};
for (const javaId of javaItems) {
    const entry: GeyserItemEntry | undefined =
        geyserItems[javaId] ?? (sameNameAfterGeyser ? { bedrock_identifier: javaId } : undefined);
    if (entry === undefined) throw new Error(`Java item ${javaId} has no GeyserMC mapping`);
    if (!(entry.bedrock_identifier in bedrockItemTable)) {
        throw new Error(`${javaId} maps to ${entry.bedrock_identifier}, which the ${bedrockVersion} item table lacks`);
    }
    itemsTable[javaId] = {
        bedrockIdentifier: entry.bedrock_identifier,
        ...(entry.bedrock_data !== undefined && entry.bedrock_data !== 0 ? { bedrockData: entry.bedrock_data } : {})
    };
}

writeTable('items.json', {
    $notice: notice(
        `Java ${javaVersion} items to Bedrock ${bedrockVersion} items: GeyserMC items.json (commit ${geyserCommit}), validated against this repository's ItemRegistryPacket capture.`
    ),
    javaVersion,
    bedrockVersion,
    geyserMappingsCommit: geyserCommit,
    items: itemsTable
});

// ---------------------------------------------------------------------------
// Entities: exact matches plus the renames the research note documents
// ---------------------------------------------------------------------------

/**
 * The documented Java to Bedrock entity renames; the list in
 * docs/research/java-to-bedrock-translation.md section 4, read out of
 * Geyser's VanillaEntities.java. GeyserMC/mappings publishes no entity file,
 * so these are declared here and verified against the pinned identifier list.
 */
const entityRenames: Record<string, string> = {
    'minecraft:breeze_wind_charge': 'minecraft:breeze_wind_charge_projectile',
    'minecraft:end_crystal': 'minecraft:ender_crystal',
    'minecraft:evoker': 'minecraft:evocation_illager',
    'minecraft:evoker_fangs': 'minecraft:evocation_fang',
    'minecraft:experience_bottle': 'minecraft:xp_bottle',
    'minecraft:experience_orb': 'minecraft:xp_orb',
    'minecraft:eye_of_ender': 'minecraft:eye_of_ender_signal',
    'minecraft:firework_rocket': 'minecraft:fireworks_rocket',
    'minecraft:fishing_bobber': 'minecraft:fishing_hook',
    'minecraft:trident': 'minecraft:thrown_trident',
    'minecraft:tropical_fish': 'minecraft:tropicalfish',
    'minecraft:villager': 'minecraft:villager_v2',
    'minecraft:wind_charge': 'minecraft:wind_charge_projectile',
    'minecraft:zombie_villager': 'minecraft:zombie_villager_v2',
    'minecraft:zombified_piglin': 'minecraft:zombie_pigman'
};

const javaEntities = Object.keys(javaRegistries['minecraft:entity_type']?.entries ?? {}).sort();
const entityLossIds = new Set(ENTITY_LOSSES.map((loss) => loss.javaId));
const entitiesTable: Record<string, string> = {};
for (const javaId of javaEntities) {
    if (entityLossIds.has(javaId)) continue;
    const renamed = entityRenames[javaId];
    const bedrockId =
        renamed ??
        // Java's 22 wooden boats and rafts collapse onto Bedrock's two boat
        // entities; the wood travels as a variant.
        (javaId.endsWith('_chest_boat') || javaId === 'minecraft:bamboo_chest_raft'
            ? 'minecraft:chest_boat'
            : javaId.endsWith('_boat') || javaId === 'minecraft:bamboo_raft'
              ? 'minecraft:boat'
              : javaId);
    if (!bedrockEntities.has(bedrockId)) {
        throw new Error(`Java entity ${javaId} maps to ${bedrockId}, which is not in the pinned identifier list`);
    }
    entitiesTable[javaId] = bedrockId;
}

writeTable('entities.json', {
    $notice: notice(
        `Java ${javaVersion} entity types to Bedrock ${bedrockVersion} entity types: exact identifier matches against the AvailableActorIdentifiersPacket capture, plus the renames docs/research/java-to-bedrock-translation.md section 4 documents from Geyser's VanillaEntities.java. The 'bedrockIdentifiers' list is the capture's identifier set, kept beside the table so the property tests run offline.`
    ),
    javaVersion,
    bedrockVersion,
    entities: entitiesTable,
    bedrockIdentifiers: [...bedrockEntities].sort()
});

// ---------------------------------------------------------------------------
// Remaining registries: biomes and enchantments
// ---------------------------------------------------------------------------

const registryLossIds = new Map(REGISTRY_LOSSES.map((loss) => [`${loss.registry} ${loss.javaId}`, loss]));

const biomeIdToName = new Map(bedrockBiomes.data_items.map((item) => [item.id, item.name]));
const javaBiomeFiles = readdirSync(join(javaData.datapack, 'data/minecraft/worldgen/biome'))
    .map((file) => `minecraft:${file.replace(/\.json$/, '')}`)
    .sort();
const biomesTable: Record<string, string> = {};
const biomeIdByName = new Map(bedrockBiomes.data_items.map((item) => [item.name, item.id]));
for (const javaId of javaBiomeFiles) {
    const sameNameId = sameNameAfterGeyser ? biomeIdByName.get(javaId) : undefined;
    const entry = geyserBiomes[javaId] ?? (sameNameId === undefined ? undefined : { bedrock_id: sameNameId });
    if (entry === undefined) throw new Error(`Java biome ${javaId} has no GeyserMC mapping`);
    const bedrockName = biomeIdToName.get(entry.bedrock_id);
    if (bedrockName === undefined) {
        throw new Error(`Java biome ${javaId} maps to Bedrock biome id ${entry.bedrock_id}, which has no name`);
    }
    const loss = registryLossIds.get(`biome ${javaId}`);
    if (loss !== undefined && loss.bedrockFallback !== bedrockName) {
        throw new Error(
            `Java biome ${javaId}: the loss list expects ${loss.bedrockFallback}, the join says ${bedrockName}`
        );
    }
    biomesTable[javaId] = bedrockName;
}

// The inverse: every Bedrock biome by identifier, carrying the numeric id a chunk stores and
// the Java biome that maps onto it. A Bedrock biome that more than one Java biome reaches -
// the River and the End - takes the one Java biome that is not a reviewed registry loss, so
// the inverse of a merge is the Java biome the merge was named after. The Bedrock biomes no
// Java biome reaches are the reviewed inverse losses, and the generator refuses to emit when
// the two sets do not partition the Bedrock biome list.
const javaByBedrockBiome = new Map<string, string>();
for (const [javaId, bedrockName] of Object.entries(biomesTable)) {
    if (registryLossIds.has(`biome ${javaId}`)) continue;
    const taken = javaByBedrockBiome.get(bedrockName);
    if (taken !== undefined) {
        throw new Error(`Bedrock biome ${bedrockName} takes both ${taken} and ${javaId}, and neither is a loss`);
    }
    javaByBedrockBiome.set(bedrockName, javaId);
}

// A loss that a Java release from `javaSince` on maps onto is not one in that release's tables.
const bedrockBiomeLossIds = new Set<string>(
    BEDROCK_BIOME_LOSSES.filter(
        (loss: BedrockBiomeLoss) => loss.javaSince === undefined || compareJavaReleases(javaVersion, loss.javaSince) < 0
    ).map((loss) => loss.bedrockId)
);
const bedrockBiomeTable: Record<string, { id: number; java?: string }> = {};
const compareCodeUnits = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
for (const [id, bedrockName] of [...biomeIdToName].sort(([, left], [, right]) => compareCodeUnits(left, right))) {
    if (id === undefined) throw new Error(`Bedrock biome ${bedrockName} has no id`);
    const java = javaByBedrockBiome.get(bedrockName);
    if (java === undefined && !bedrockBiomeLossIds.has(bedrockName)) {
        throw new Error(`Bedrock biome ${bedrockName} has no Java source and no reviewed inverse loss`);
    }
    if (java !== undefined && bedrockBiomeLossIds.has(bedrockName)) {
        throw new Error(`Bedrock biome ${bedrockName} is a reviewed inverse loss but ${java} maps onto it`);
    }
    bedrockBiomeTable[bedrockName] = java === undefined ? { id } : { id, java };
}

const bedrockEnchantmentNames = new Set(bedrockEnchantments.data_items.map((item) => item.name));
/**
 * The three Java enchantment names Bedrock spells differently; everything
 * else matches exactly, verified against the bedrock-samples metadata.
 */
const enchantmentRenames: Record<string, string> = {
    'minecraft:binding_curse': 'minecraft:binding',
    'minecraft:infinity': 'minecraft:bow_infinity',
    'minecraft:vanishing_curse': 'minecraft:vanishing'
};
const javaEnchantmentFiles = readdirSync(join(javaData.datapack, 'data/minecraft/enchantment'))
    .map((file) => `minecraft:${file.replace(/\.json$/, '')}`)
    .sort();
const enchantmentsTable: Record<string, string> = {};
for (const javaId of javaEnchantmentFiles) {
    if (registryLossIds.has(`enchantment ${javaId}`)) continue;
    const bedrockId = enchantmentRenames[javaId] ?? javaId;
    if (!bedrockEnchantmentNames.has(bedrockId)) {
        throw new Error(`Java enchantment ${javaId} maps to ${bedrockId}, which bedrock-samples does not list`);
    }
    enchantmentsTable[javaId] = bedrockId;
}

/**
 * Joins one Java registry onto a pinned Bedrock name list by identifier,
 * applying the listed renames and skipping the reviewed losses. Refuses to
 * emit when a Java entry is neither renamed, matched, nor a reviewed loss,
 * which is how a Bedrock version that drops a name gets caught.
 */
const joinByName = (
    registry: 'mob_effect' | 'potion',
    javaIds: readonly string[],
    bedrockNames: ReadonlySet<string>,
    renames: Readonly<Record<string, string>>
): Record<string, string> => {
    const table: Record<string, string> = {};
    for (const javaId of javaIds) {
        if (registryLossIds.has(`${registry} ${javaId}`)) continue;
        const bedrockId = renames[javaId] ?? javaId;
        if (!bedrockNames.has(bedrockId)) {
            throw new Error(`Java ${registry} ${javaId} maps to ${bedrockId}, which bedrock-samples does not list`);
        }
        table[javaId] = bedrockId;
    }
    return table;
};

const javaMobEffects = Object.keys(javaRegistries['minecraft:mob_effect']?.entries ?? {}).sort();
const bedrockMobEffectNames = new Set(bedrockMobEffects.data_items.map((item) => item.name));
const mobEffectsTable = joinByName('mob_effect', javaMobEffects, bedrockMobEffectNames, {
    // Bedrock spells the raid reward the other way round; every other effect matches exactly.
    'minecraft:hero_of_the_village': 'minecraft:village_hero'
});

const javaPotions = Object.keys(javaRegistries['minecraft:potion']?.entries ?? {}).sort();
const bedrockPotionNames = new Set(bedrockPotions.data_items.map((item) => item.name));
const potionsTable = joinByName('potion', javaPotions, bedrockPotionNames, {
    // Bedrock drops the underscore in night vision, in both the base and the extended potion.
    'minecraft:long_night_vision': 'minecraft:long_nightvision',
    'minecraft:night_vision': 'minecraft:nightvision'
});

writeTable('registries.json', {
    $notice: notice(
        `Java ${javaVersion} biome, enchantment, mob effect and potion identifiers to Bedrock ${bedrockVersion} identifiers: GeyserMC biomes.json joined against the bedrock-samples mojang-biomes ids, and the enchantment, effect and potion name correspondences verified against mojang-enchantments, mojang-effects and mojang-potion-effects. 'bedrockBiomes' is the inverse, every Bedrock biome by identifier with the numeric id a chunk stores. The 'bedrock' lists are the pinned Bedrock name sets, kept beside the table so the property tests run offline.`
    ),
    javaVersion,
    bedrockVersion,
    geyserMappingsCommit: geyserCommit,
    biome: biomesTable,
    enchantment: enchantmentsTable,
    mob_effect: mobEffectsTable,
    potion: potionsTable,
    bedrockBiomes: bedrockBiomeTable,
    bedrock: {
        enchantment: [...bedrockEnchantmentNames].sort(),
        mob_effect: [...bedrockMobEffectNames].sort(),
        potion: [...bedrockPotionNames].sort()
    }
});

// ---------------------------------------------------------------------------
// The Java identifier census: the registries no Bedrock table answers
// ---------------------------------------------------------------------------

/**
 * Every `minecraft:` id a data-driven registry publishes, read as the file
 * tree under `data/minecraft/<registry>/`: `worldgen/structure/village/plains.json`
 * is `minecraft:village/plains`.
 */
const datapackRegistryIds = (registry: string): string[] | undefined => {
    const root = join(javaData.datapack, 'data/minecraft', registry);
    if (!existsSync(root)) return undefined;
    const ids: string[] = [];
    const descend = (directory: string, prefix: string): void => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            if (entry.isDirectory()) descend(join(directory, entry.name), `${prefix}${entry.name}/`);
            else if (entry.name.endsWith('.json'))
                ids.push(`minecraft:${prefix}${entry.name.slice(0, -'.json'.length)}`);
        }
    };
    descend(root, '');
    return ids.sort();
};

/**
 * The entries of one census registry: its datapack files when Java ships it
 * as data, otherwise its entry list in the registry report. A registry in
 * neither is a classification mistake rather than missing data, so it throws.
 */
const censusRegistryIds = (registry: string): string[] => {
    const fromData = datapackRegistryIds(registry);
    if (fromData !== undefined && fromData.length > 0) return fromData;
    const reported = javaRegistries[`minecraft:${registry}`]?.entries;
    if (reported === undefined) {
        throw new Error(`${registry} is neither a Java ${javaVersion} data directory nor a reported registry`);
    }
    return Object.keys(reported).sort();
};

const censusRegistries = [
    ...SERVER_SIDE_REGISTRIES.map((entry) => entry.registry),
    ...UNTRANSLATED_REGISTRIES.map((entry) => entry.registry)
].sort();
const census: Record<string, string[]> = {};
for (const registry of censusRegistries) census[registry] = censusRegistryIds(registry);

writeTable('javaIdentifiers.json', {
    $notice: notice(
        `Every Java ${javaVersion} identifier of the registries no Bedrock table answers, read from Mojang's reports/registries.json and the data directories beside it. The loader checks a reference into one of these registries against this census, so a typo still fails the load even where there is no Bedrock side to map onto. Which registries appear is decided by src/packRegistries.ts and the untranslated rows of src/lossList.ts.`
    ),
    javaVersion,
    registries: census
});

console.log(
    `Tables generated: ${Object.keys(blocksTable).length} blocks (${canonicalByStateId.length} states onto ${targetStates.size} Bedrock states), ${Object.keys(itemsTable).length} items, ${Object.keys(entitiesTable).length} entities, ${Object.keys(biomesTable).length} biomes (inverted onto ${javaByBedrockBiome.size} of ${Object.keys(bedrockBiomeTable).length} Bedrock biomes), ${Object.keys(enchantmentsTable).length} enchantments, ${Object.keys(mobEffectsTable).length} mob effects, ${Object.keys(potionsTable).length} potions, and a census of ${Object.values(census).reduce((total, ids) => total + ids.length, 0)} identifiers over ${censusRegistries.length} registries with no Bedrock table.`
);

mkdirSync(tablesDir, { recursive: true });
writeFileSync(join(tablesDir, 'pair.json'), `${JSON.stringify(pair, null, 4)}\n`);
console.log(`Wrote ${join(tablesDir, 'pair.json')}`);
