/**
 * Generates `src/tables/itemTypes.json`: every Bedrock item identifier with
 * the Java 26.3 default components of the Java item that maps onto it.
 *
 * Item identity stays Bedrock-shaped and item properties come from Java, which
 * is the plan's decision for phase 1 (docs/plans/data-driven-vanilla.md
 * sections 2 and 4). The join runs one way: read Mojang's per-item default
 * component reports, map each Java identifier through `@jsprismarine/mapping`,
 * and key the result by the Bedrock identifier the server already uses.
 *
 * Run after a Java or Bedrock version bump:
 *
 *     pnpm --filter @jsprismarine/bedrock-data run fetch:sources
 *     pnpm exec turbo run build --filter=@jsprismarine/mapping
 *     pnpm --filter @jsprismarine/items run generate:item-types
 *
 * The generator refuses to emit when a Java item has neither a mapping nor a
 * reviewed exception, when a component name is not in the pinned registry
 * report, when a produced Bedrock identifier is missing from the captured item
 * table, or when the computed exceptions disagree with `src/exceptions.ts`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

import { EXCEPTED_ITEM_COUNT, ITEM_TABLE_EXCEPTIONS } from '../../src/exceptions.ts';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(packageDir, '../..');
const cacheRoot = join(repoRoot, 'node_modules/.cache/jsprismarine');
const tablePath = join(packageDir, 'src/tables/itemTypes.json');

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

// ---------------------------------------------------------------------------
// Pinned sources
// ---------------------------------------------------------------------------

interface SourcesManifest {
    javaServer: { version: string };
    bds: { version: string };
}

// sources.json is parsed JSON; only the pins this generator reads are typed.
const sources = readJson(join(repoRoot, 'packages/bedrock-data/sources.json')) as SourcesManifest;
const javaVersion = sources.javaServer.version;
const bedrockVersion = sources.bds.version;

// Node cannot load another package's TypeScript sources, which import each
// other without file extensions, so the generator reads the built mapping.
const mappingDist = resolve(packageDir, '../mapping/dist');
if (!existsSync(mappingDist)) {
    throw new Error('Build the mapping package first: pnpm exec turbo run build --filter=@jsprismarine/mapping');
}
const { javaItemToBedrock } = await import(`${mappingDist}/index.es.js`);

/** The item table captured from a Bedrock Dedicated Server, the Bedrock side's authority. */
const bedrockItemTable = readJson(join(repoRoot, 'packages/bedrock-data/src/generated/item_table.json')) as Record<
    string,
    unknown
>;

// ---------------------------------------------------------------------------
// The Java data generator reports
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
const componentsDir = join(generatedDir, 'reports/minecraft/components/item');
if (!existsSync(componentsDir)) {
    const serverJar = join(cacheRoot, 'java-server', javaVersion, 'server.jar');
    if (!existsSync(serverJar)) {
        throw new Error(
            `${serverJar} is missing. Run \`pnpm --filter @jsprismarine/bedrock-data run fetch:sources\` first.`
        );
    }
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

/** `reports/registries.json`, read for the component type registry and the item registry. */
const registries = readJson(join(generatedDir, 'reports/registries.json')) as Record<
    string,
    { entries: Record<string, unknown> }
>;
const componentTypes = Object.keys(registries['minecraft:data_component_type']!.entries).sort();
const javaItemIds = Object.keys(registries['minecraft:item']!.entries).sort();

// ---------------------------------------------------------------------------
// The join
// ---------------------------------------------------------------------------

/** One Java item's default components, as `--reports` writes the file. */
interface DefaultComponentsReport {
    components?: Record<string, unknown>;
}

const defaultsOf = (javaId: string): Record<string, unknown> => {
    const file = join(componentsDir, `${javaId.slice('minecraft:'.length)}.json`);
    if (!existsSync(file)) throw new Error(`${javaId} has no default component report at ${file}`);
    const report = readJson(file) as DefaultComponentsReport;
    return report.components ?? {};
};

const exceptedJavaIds = new Set(ITEM_TABLE_EXCEPTIONS.flatMap((exception) => exception.javaIds));

interface Candidate {
    javaId: string;
    data: number | undefined;
    components: Record<string, unknown>;
}

const groups = new Map<string, Candidate[]>();
const computedLosses: { javaId: string; bedrockId: string; reason: string }[] = [];
const unseenComponents = new Set<string>();
const defaultCounts: Record<string, number> = {};

for (const javaId of javaItemIds) {
    const components = defaultsOf(javaId);
    for (const name of Object.keys(components)) {
        if (!componentTypes.includes(name)) unseenComponents.add(name);
        defaultCounts[name] = (defaultCounts[name] ?? 0) + 1;
    }

    const mapped = javaItemToBedrock(javaId);
    if (mapped.kind === 'unknown') {
        throw new Error(`${javaId} is in the Java item registry but not in the mapping table`);
    }
    if (mapped.kind === 'loss') {
        computedLosses.push({ javaId, bedrockId: mapped.bedrock.identifier, reason: mapped.loss.reason });
        continue;
    }

    const list = groups.get(mapped.bedrock.identifier) ?? [];
    list.push({ javaId, data: mapped.bedrock.data, components });
    groups.set(mapped.bedrock.identifier, list);
}

if (unseenComponents.size > 0) {
    throw new Error(`default components name types the registry report does not have: ${[...unseenComponents]}`);
}

/**
 * Picks which Java item supplies a shared Bedrock identifier's properties: the
 * one whose own identifier matches, then the lowest Bedrock damage value
 * (an absent value is zero), then the first identifier alphabetically.
 */
const pickWinner = (bedrockId: string, candidates: Candidate[]): Candidate => {
    const exact = candidates.find((candidate) => candidate.javaId === bedrockId);
    if (exact) return exact;
    return [...candidates].sort(
        (left, right) => (left.data ?? 0) - (right.data ?? 0) || left.javaId.localeCompare(right.javaId)
    )[0]!;
};

interface ItemTypeRow {
    /** The Java item the components came from. */
    java: string;
    /** The Bedrock damage value that selects this item, present only where one does. */
    data?: number;
    /** Other Java items that reach this identifier, with the damage value that selects each. */
    merged?: { java: string; data?: number }[];
    /** The Java default components, verbatim. */
    components: Record<string, unknown>;
}

const rows: Record<string, ItemTypeRow> = {};
const computedMerges: { javaId: string; bedrockId: string; supersededBy: string }[] = [];

for (const bedrockId of [...groups.keys()].sort()) {
    const candidates = groups.get(bedrockId)!;
    const winner = pickWinner(bedrockId, candidates);
    const others = candidates.filter((candidate) => candidate !== winner);
    for (const other of others) {
        computedMerges.push({ javaId: other.javaId, bedrockId, supersededBy: winner.javaId });
    }

    rows[bedrockId] = {
        java: winner.javaId,
        ...(winner.data !== undefined ? { data: winner.data } : {}),
        ...(others.length > 0
            ? {
                  merged: others
                      .map((other) => ({
                          java: other.javaId,
                          ...(other.data !== undefined ? { data: other.data } : {})
                      }))
                      .sort((left, right) => left.java.localeCompare(right.java))
              }
            : {}),
        components: winner.components
    };
}

// ---------------------------------------------------------------------------
// The number providers item components point at
// ---------------------------------------------------------------------------

/**
 * 26.3 moved fuel, compost and brewing numbers behind `context_int_provider`
 * and `context_float_provider` files, so a burn time is a tree of registry
 * lookups rather than a number. The generator follows every reference an item
 * component makes and emits the definitions verbatim, which is what lets
 * `numberProvider.ts` evaluate one at runtime without the data generator.
 */
const providerDirs = [
    join(generatedDir, 'data/minecraft/context_int_provider'),
    join(generatedDir, 'data/minecraft/context_float_provider')
];

const providerDefinition = (id: string): unknown => {
    const relative = `${id.slice('minecraft:'.length)}.json`;
    for (const dir of providerDirs) {
        const file = join(dir, relative);
        if (existsSync(file)) return readJson(file);
    }
    throw new Error(`no context provider file for ${id}`);
};

const providers: Record<string, unknown> = {};
const pending: string[] = [];

const collectReferences = (node: unknown): void => {
    if (typeof node === 'string' && node.startsWith('minecraft:') && !node.startsWith('minecraft:block/')) {
        pending.push(node);
        return;
    }
    if (Array.isArray(node)) {
        for (const item of node) collectReferences(item);
        return;
    }
    if (typeof node === 'object' && node !== null) {
        for (const [key, value] of Object.entries(node)) {
            // `type` names the node kind and `condition` names a predicate;
            // neither is a provider reference.
            if (key === 'type' || key === 'condition') continue;
            collectReferences(value);
        }
    }
};

for (const row of Object.values(rows)) {
    for (const [name, value] of Object.entries(row.components)) {
        if (
            name !== 'minecraft:cooking_fuel' &&
            name !== 'minecraft:brewing_fuel' &&
            name !== 'minecraft:compostable'
        ) {
            continue;
        }
        collectReferences(value);
    }
}

while (pending.length > 0) {
    const id = pending.pop()!;
    if (id in providers) continue;
    const definition = providerDefinition(id);
    providers[id] = definition;
    collectReferences(definition);
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

const missingFromBedrock = Object.keys(rows).filter((bedrockId) => !(bedrockId in bedrockItemTable));
if (missingFromBedrock.length > 0) {
    throw new Error(`the captured Bedrock item table has no entry for ${missingFromBedrock.join(', ')}`);
}

const computed = new Set([
    ...computedLosses.map((loss) => loss.javaId),
    ...computedMerges.map((merge) => merge.javaId)
]);
const unreviewed = [...computed].filter((javaId) => !exceptedJavaIds.has(javaId)).sort();
const stale = [...exceptedJavaIds].filter((javaId) => !computed.has(javaId)).sort();
if (unreviewed.length > 0) {
    throw new Error(`these Java items are dropped with no reviewed exception: ${unreviewed.join(', ')}`);
}
if (stale.length > 0) {
    throw new Error(`these reviewed exceptions match nothing and should be removed: ${stale.join(', ')}`);
}
if (computed.size !== EXCEPTED_ITEM_COUNT) {
    throw new Error(`EXCEPTED_ITEM_COUNT says ${EXCEPTED_ITEM_COUNT}, the join dropped ${computed.size}`);
}

for (const merge of computedMerges) {
    const row = ITEM_TABLE_EXCEPTIONS.find((exception) => exception.javaIds.includes(merge.javaId));
    if (row?.supersededBy !== merge.supersededBy) {
        throw new Error(
            `${merge.javaId} is superseded by ${merge.supersededBy}, the exception list says ${row?.supersededBy}`
        );
    }
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const table = {
    javaVersion,
    bedrockVersion,
    componentTypes,
    defaultCounts: Object.fromEntries(
        Object.entries(defaultCounts).sort(([left], [right]) => left.localeCompare(right))
    ),
    javaItemCount: javaItemIds.length,
    exceptedJavaItems: [...computed].sort(),
    providers: Object.fromEntries(Object.entries(providers).sort(([left], [right]) => left.localeCompare(right))),
    items: rows
};

// The table is not in `.prettierignore`, so the generator formats it the way
// `pnpm run lint` expects rather than leaving a 1.6 MB reformat in the diff.
const prettierConfig = await resolveConfig(tablePath);
writeFileSync(tablePath, await format(JSON.stringify(table), { ...prettierConfig, filepath: tablePath }));

console.log(`Java ${javaVersion} to Bedrock ${bedrockVersion}`);
console.log(`  component types:     ${componentTypes.length}`);
console.log(`  types with defaults: ${Object.keys(defaultCounts).length}`);
console.log(`  Java items read:     ${javaItemIds.length}`);
console.log(`  Bedrock rows:        ${Object.keys(rows).length}`);
console.log(`  reviewed exceptions: ${computed.size} items in ${ITEM_TABLE_EXCEPTIONS.length} rows`);
console.log(`  wrote ${tablePath}`);
