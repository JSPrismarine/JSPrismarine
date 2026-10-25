/**
 * Generates the vendored mapping tables under `src/tables/` from the pinned
 * sources (plan section 5, decision 4): the GeyserMC/mappings join for blocks
 * and items, Mojang's Java data generator reports for the Java side, this
 * repository's own BDS 1.26.51.1 captures for the Bedrock side, and the
 * bedrock-samples metadata for biome and enchantment names.
 *
 * Run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` first; it
 * populates `node_modules/.cache/jsprismarine/`. This script runs the Java
 * data generator against the hash-verified jar when its reports are missing
 * from the cache, which needs a JDK of at least version 25 (`JAVA_HOME` or
 * `JSP_JAVA_HOME` point at one).
 *
 * The generator refuses to emit when any Java identifier has neither a
 * mapping nor a reviewed loss entry, and when any produced Bedrock block
 * state is not in the pinned palette. Every refusal is a thrown error.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ENTITY_LOSSES, REGISTRY_LOSSES } from '../../src/lossList.ts';
import { type JavaNbtCompound, readGzippedJavaNbt } from './java-nbt.ts';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(packageDir, '../..');
const cacheRoot = join(repoRoot, 'node_modules/.cache/jsprismarine');
const tablesDir = join(packageDir, 'src/tables');

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

// ---------------------------------------------------------------------------
// Pinned sources
// ---------------------------------------------------------------------------

interface SourcesManifest {
    javaServer: { version: string };
    bedrockSamples: { tag: string; commit: string };
    geyserMappings: { commit: string };
}

// sources.json is parsed JSON; only the pins the generator reads are typed.
const sources = readJson(join(repoRoot, 'packages/bedrock-data/sources.json')) as SourcesManifest;
const javaVersion = sources.javaServer.version;
const geyserCommit = sources.geyserMappings.commit;

const geyserDir = join(cacheRoot, 'geyser-mappings', geyserCommit, 'unpacked', `mappings-${geyserCommit}`);
const samplesDir = join(
    cacheRoot,
    'bedrock-samples',
    sources.bedrockSamples.tag,
    'unpacked',
    `bedrock-samples-${sources.bedrockSamples.commit}`,
    'metadata/vanilladata_modules'
);
const serverJar = join(cacheRoot, 'java-server', javaVersion, 'server.jar');
for (const required of [geyserDir, samplesDir, serverJar]) {
    if (!existsSync(required)) {
        throw new Error(
            `${required} is missing. Run \`pnpm --filter @jsprismarine/bedrock-data run fetch:sources\` first.`
        );
    }
}

// ---------------------------------------------------------------------------
// The Java data generator reports (run against the hash-verified jar)
// ---------------------------------------------------------------------------

/** Finds a JDK of at least version 25, which the 26.3 server requires. */
const findJava = (): string => {
    const candidates: string[] = [];
    for (const env of ['JSP_JAVA_HOME', 'JAVA_HOME']) {
        const home = process.env[env];
        if (home) candidates.push(home);
    }
    if (process.platform === 'darwin') {
        try {
            const home = execFileSync('/usr/libexec/java_home', ['-v', '25+'], { encoding: 'utf8' }).trim();
            if (home) candidates.push(home);
        } catch {
            // No registered JVM matches; the error below says what to install.
        }
    }
    for (const home of candidates) {
        const java = join(home, 'bin/java');
        if (!existsSync(java)) continue;
        // `java --version` prints `openjdk 27 2026-09-15` on stdout; the older `-version`
        // prints its banner to stderr and leaves stdout empty, so every JDK looked too old.
        const banner = execFileSync(java, ['--version'], { encoding: 'utf8' });
        const major = Number(/\b(\d+)/.exec(banner.split('\n')[0] ?? '')?.[1]);
        if (major >= 25) return java;
    }
    throw new Error('No JDK >= 25 found. Point JAVA_HOME or JSP_JAVA_HOME at one.');
};

const reportsRoot = join(cacheRoot, 'java-reports', javaVersion);
const generatedDir = join(reportsRoot, 'generated');
if (!existsSync(join(generatedDir, 'reports/blocks.json'))) {
    console.log(`Running the Java ${javaVersion} data generator into ${generatedDir}`);
    mkdirSync(generatedDir, { recursive: true });
    execFileSync(
        findJava(),
        [
            '-DbundlerMainClass=net.minecraft.data.Main',
            '-jar',
            serverJar,
            '--reports',
            '--server',
            '--all',
            '--output',
            generatedDir
        ],
        { cwd: reportsRoot, stdio: 'inherit' }
    );
}

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
const javaBlocks = readJson(join(generatedDir, 'reports/blocks.json')) as Record<string, JavaBlock>;
const javaRegistries = readJson(join(generatedDir, 'reports/registries.json')) as Record<
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
const palette = readJson(join(repoRoot, 'packages/minecraft/datagen/snapshot/block-palette.json')) as PaletteFile;
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

const bedrockItemTable = readJson(join(repoRoot, 'packages/bedrock-data/src/jsp/required_item_list.json')) as Record<
    string,
    unknown
>;

const entityIdentifiersPath = join(repoRoot, 'packages/bedrock-data/src/generated/entity_identifiers.json');
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

// The join is positional: entry i belongs to Java block state id i, and
// reports/blocks.json supplies the ordering. The report lists blocks
// alphabetically while ids follow registry order, so each block's ids are
// verified against its own first id. The lookup arithmetic also needs each
// block's states in cross-product order, so that is verified too.
const blockNames = Object.keys(javaBlocks);
let stateCount = 0;
for (const name of blockNames) {
    const block = javaBlocks[name];
    if (!block) continue;
    stateCount += block.states.length;
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
if (stateCount !== mappingList.length) {
    throw new Error(`Java reports ${stateCount} states but blocks.nbt has ${mappingList.length} entries`);
}

interface PaletteState {
    name: string;
    states: Record<string, string | number>;
}
/** Distinct Bedrock target states by canonical form, in first-seen order. */
const targetStates = new Map<string, PaletteState>();
const targetOf = (javaName: string, entry: JavaNbtCompound): string => {
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
        const entry = mappingList[state.id];
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            throw new Error(`${name}: blocks.nbt entry ${state.id} is not a compound`);
        }
        canonicalByStateId[state.id] = targetOf(name, entry);
    }
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

const javaItems = Object.keys(javaRegistries['minecraft:item']?.entries ?? {}).sort();
const itemsTable: Record<string, { bedrockIdentifier: string; bedrockData?: number }> = {};
for (const javaId of javaItems) {
    const entry = geyserItems[javaId];
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
const javaBiomeFiles = readdirSync(join(generatedDir, 'data/minecraft/worldgen/biome'))
    .map((file) => `minecraft:${file.replace(/\.json$/, '')}`)
    .sort();
const biomesTable: Record<string, string> = {};
for (const javaId of javaBiomeFiles) {
    const entry = geyserBiomes[javaId];
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
const javaEnchantmentFiles = readdirSync(join(generatedDir, 'data/minecraft/enchantment'))
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

writeTable('registries.json', {
    $notice: notice(
        `Java ${javaVersion} biome and enchantment identifiers to Bedrock ${bedrockVersion} identifiers: GeyserMC biomes.json joined against the bedrock-samples mojang-biomes ids, and the enchantment name correspondence verified against mojang-enchantments. The 'bedrock' lists are the pinned Bedrock name sets, kept beside the tables so the property tests run offline.`
    ),
    javaVersion,
    bedrockVersion,
    geyserMappingsCommit: geyserCommit,
    biome: biomesTable,
    enchantment: enchantmentsTable,
    bedrock: {
        biome: [...biomeIdToName.values()].sort(),
        enchantment: [...bedrockEnchantmentNames].sort()
    }
});

console.log(
    `Tables generated: ${Object.keys(blocksTable).length} blocks (${mappingList.length} states onto ${targetStates.size} Bedrock states), ${Object.keys(itemsTable).length} items, ${Object.keys(entitiesTable).length} entities, ${Object.keys(biomesTable).length} biomes, ${Object.keys(enchantmentsTable).length} enchantments.`
);
