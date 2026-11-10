/**
 * Docs facts: values the documentation quotes that the code owns, such as the supported protocols, the
 * Node.js requirement or the commands the server registers.
 *
 * A page marks such a value instead of typing it in for good:
 *
 *     Node.js <!-- fact:node.minimum -->`26.4.0`<!-- /fact --> or newer
 *
 * GitHub hides the comments, so the source still reads naturally. The docs build replaces every marked
 * value with the current one and drops the markers, so the site never quotes a stale number.
 * `pnpm run docs:facts` writes the current values back into the Markdown for readers of the source.
 *
 * The marked text keeps its wrapping: inline code stays inline code, and a fenced block keeps its fence
 * and language, so only the value itself changes.
 *
 * Counts of game data come from the downloads the data scripts cache (the Java datapack and reports,
 * bedrock-samples, the BDS behavior pack). A checkout without them, such as the lint job, keeps the
 * Markdown's values for those facts; the docs build fetches them first, so the site always counts.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { userCacheDir } from '../../packages/server/src/packaged/userCache.ts';
import { palette } from './site/.vitepress/theme/tokens.ts';
import { loadCommands, loadOptionalSettings, loadSettings } from './code-data.mts';
import { loadProject, repoRoot } from './project.mts';

/** Pinned downloads in `packages/bedrock-data/sources.json`, as far as the docs quote them. */
interface Sources {
    bds: {
        defaultProtocolVersion: number;
        versions: Record<string, { minecraftVersion: string; serverVersion: string; sizeInBytes: number }>;
    };
    bedrockSamples: { tag: string };
    javaServer: { version: string; sizeInBytes: number };
}

/** Megabytes as a reader sees them on a download, such as `95 MB`. */
const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

/** Joins words into lines of at most `width` characters, for a list shown in a code block. */
function wrap(words: readonly string[], width = 100) {
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        if (line && line.length + 1 + word.length > width) {
            lines.push(line);
            line = word;
        } else {
            line = line ? `${line} ${word}` : word;
        }
    }
    if (line) lines.push(line);
    return lines.join('\n');
}

/** "a", "a and b", "a, b and c". */
const list = (items: readonly string[]) =>
    items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/** A Markdown table with padded columns, matching how Prettier formats one. */
function table(header: readonly string[], rows: readonly (readonly string[])[]) {
    const widths = header.map((cell, column) => Math.max(cell.length, ...rows.map((row) => row[column].length)));
    const line = (cells: readonly string[]) =>
        `| ${cells.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`;
    return [line(header), `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`, ...rows.map(line)].join('\n');
}

/** Command facts, from the registration the server runs. */
async function commandFacts() {
    const { implemented, registered, unwired } = await loadCommands();
    return {
        'commands.implemented': String(implemented),
        'commands.registered': String(registered.length),
        'commands.unwired': String(unwired.length),
        'commands.unwired.example': `/${unwired[0]?.[0] ?? ''}`,
        // Surrounded by blank lines so the table stays its own block between the markers.
        'commands.unwired.table': `\n${table(
            ['Command', 'What it would need'],
            unwired.map(([name, reason]) => [`\`/${name}\``, reason])
        )}\n`,
        'commands.registered.list': wrap(registered.map(({ name }) => name))
    };
}

/** Settings facts, from the file a fresh server writes. */
async function configFacts() {
    const rows = (await loadSettings()).map(({ key, comment }) => [`\`${key}\``, comment]);
    const optional = (await loadOptionalSettings()).map(({ key, comment }) => [`\`${key}\``, comment]);
    return {
        'config.count': String(rows.length),
        'config.table': `\n${table(['Setting', 'What it does'], rows)}\n`,
        // Read when present, never written: a fresh file leaves them out.
        'config.optionalCount': String(optional.length),
        'config.optionalTable': `\n${table(['Setting', 'What it does'], optional)}\n`,
        // The settings that add packs to the stack, for the page about extending the server.
        'config.contentTable': `\n${table(
            ['Setting', 'What it does'],
            rows.filter(([key]) => key.startsWith('`content-'))
        )}\n`
    };
}

/** The events `Server.on` accepts, read from the `EventTypes` union that types it. */
function eventFacts() {
    const source = readFileSync(
        path.join(repoRoot, 'packages', 'prismarine', 'src', 'events', 'EventEmitter.ts'),
        'utf8'
    );
    const union = /export type EventTypes =([\s\S]*?);/.exec(source)?.[1] ?? '';
    const events = [...union.matchAll(/\['(\w+)', (\w+)\]/g)].map(([, name, type]) => [
        `\`${name}\``,
        `\`${type.replace(/^\w/, (letter) => letter.toUpperCase())}\``
    ]);
    if (!events.length) throw new Error('The docs facts no longer find the EventTypes union in EventEmitter.ts.');
    return {
        'events.count': String(events.length),
        'events.table': `\n${table(['Event', 'Listener receives'], events)}\n`
    };
}

/**
 * The count budgets a world tick runs under, read from the constants that set them. No budget in a
 * tick is a time, so these counts are the whole of what bounds the work.
 */
function tickBudgetFacts() {
    const src = path.join(repoRoot, 'packages', 'prismarine', 'src');
    const budgets = {
        'tick.inputBudget': ['network/InputQueue.ts', 'INPUT_ADMISSION_BUDGET_PER_TICK'],
        'tick.chunkAdmissionBudget': ['world/ChunkAdmissions.ts', 'CHUNK_ADMISSION_BUDGET_PER_TICK'],
        'tick.blockUpdateBudget': ['world/BlockUpdateScheduler.ts', 'BLOCK_UPDATE_BUDGET_PER_TICK'],
        'tick.scheduledTickBudget': ['world/WorldSystems.ts', 'SCHEDULED_TICK_BUDGET_PER_TICK'],
        'tick.lightBudget': ['world/WorldSystems.ts', 'LIGHT_BUDGET_PER_TICK']
    } as const;
    return Object.fromEntries(
        Object.entries(budgets).map(([fact, [file, name]]) => {
            const source = readFileSync(path.join(src, file), 'utf8');
            const value = new RegExp(`export const ${name} = (\\d+);`).exec(source)?.[1];
            if (value === undefined) throw new Error(`The docs facts no longer find ${name} in ${file}.`);
            return [fact, value];
        })
    );
}

/** The download cache the data scripts fill, where the generated game data lives. */
const cacheRoot = path.join(repoRoot, 'node_modules', '.cache', 'jsprismarine');

/** Every file under a directory, as paths relative to it. */
function filesUnder(dir: string) {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)));
}

/** The JSON files under a directory, parsed. Each is an untyped boundary; callers read named fields. */
function jsonUnder(dir: string): unknown[] {
    return filesUnder(dir)
        .filter((file) => file.endsWith('.json'))
        .map((file) => JSON.parse(readFileSync(path.join(dir, file), 'utf8')));
}

/** Reads a field off parsed JSON without trusting its shape. */
function field(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

/**
 * A group of facts read from one source that may be missing, such as a download the data scripts put
 * in the cache. `read` runs only when `dir` exists.
 */
interface FactSource {
    label: string;
    dir: string;
    names: readonly string[];
    read: (dir: string) => Record<string, number> | Promise<Record<string, number>>;
}

/** Counts read from the generated game data: the Java datapack and reports, bedrock-samples and BDS. */
function dataSources(sources: Sources): FactSource[] {
    const java = sources.javaServer.version;
    return [
        {
            label: `the Java ${java} vanilla datapack`,
            dir: path.join(cacheRoot, 'vanilla-datapack', java, 'data'),
            names: [
                'java.datapack.files',
                'java.datapack.tags',
                'java.datapack.recipes',
                'java.datapack.lootTables',
                'java.datapack.lootTables.furnaceSmelt',
                'java.datapack.advancements',
                'java.datapack.advancements.recipeRewards',
                'java.datapack.advancements.criteria',
                'java.datapack.advancements.triggers',
                'java.datapack.structures',
                'java.datapack.structures.types',
                'java.datapack.structures.terrainAdaptation',
                'java.datapack.structureSets',
                'java.datapack.templatePools'
            ],
            read: (dir) => {
                const vanilla = path.join(dir, 'minecraft');
                const lootDir = path.join(vanilla, 'loot_table');
                const advancements = jsonUnder(path.join(vanilla, 'advancement'));
                const criteria = advancements.flatMap((advancement) => {
                    const entries = field(advancement, 'criteria');
                    return typeof entries === 'object' && entries !== null ? Object.values(entries) : [];
                });
                const structures = jsonUnder(path.join(vanilla, 'worldgen', 'structure'));
                return {
                    'java.datapack.files': filesUnder(dir).length,
                    'java.datapack.tags': filesUnder(path.join(vanilla, 'tags')).length,
                    'java.datapack.recipes': jsonUnder(path.join(vanilla, 'recipe')).length,
                    'java.datapack.lootTables': jsonUnder(lootDir).length,
                    'java.datapack.lootTables.furnaceSmelt': filesUnder(lootDir).filter((file) =>
                        /"(minecraft:)?furnace_smelt"/.test(readFileSync(path.join(lootDir, file), 'utf8'))
                    ).length,
                    'java.datapack.advancements': advancements.length,
                    'java.datapack.advancements.recipeRewards': advancements.filter((advancement) => {
                        const recipes = field(field(advancement, 'rewards'), 'recipes');
                        return Array.isArray(recipes) && recipes.length > 0;
                    }).length,
                    'java.datapack.advancements.criteria': criteria.length,
                    'java.datapack.advancements.triggers': new Set(criteria.map((entry) => field(entry, 'trigger')))
                        .size,
                    'java.datapack.structures': structures.length,
                    'java.datapack.structures.types': new Set(structures.map((structure) => field(structure, 'type')))
                        .size,
                    'java.datapack.structures.terrainAdaptation': structures.filter(
                        (structure) => field(structure, 'terrain_adaptation') !== undefined
                    ).length,
                    'java.datapack.structureSets': jsonUnder(path.join(vanilla, 'worldgen', 'structure_set')).length,
                    'java.datapack.templatePools': jsonUnder(path.join(vanilla, 'worldgen', 'template_pool')).length
                };
            }
        },
        {
            label: `the Java ${java} data reports`,
            dir: path.join(cacheRoot, 'java-reports', java, 'generated', 'reports'),
            names: [
                'java.reports.files',
                'java.reports.blocks',
                'java.reports.blockStates',
                'java.reports.climateBoxes'
            ],
            read: (dir) => {
                const blocks: unknown = JSON.parse(readFileSync(path.join(dir, 'blocks.json'), 'utf8'));
                const blockReports = typeof blocks === 'object' && blocks !== null ? Object.values(blocks) : [];
                const overworld: unknown = JSON.parse(
                    readFileSync(path.join(dir, 'biome_parameters', 'minecraft', 'overworld.json'), 'utf8')
                );
                const boxes = field(overworld, 'biomes');
                return {
                    'java.reports.files': filesUnder(dir).length,
                    'java.reports.blocks': blockReports.length,
                    'java.reports.blockStates': blockReports.reduce<number>((sum, block) => {
                        const states = field(block, 'states');
                        return sum + (Array.isArray(states) ? states.length : 0);
                    }, 0),
                    'java.reports.climateBoxes': Array.isArray(boxes) ? boxes.length : 0
                };
            }
        },
        {
            label: `the Java ${java} structure templates`,
            dir: path.join(cacheRoot, 'java-structures', java),
            names: ['java.templates'],
            read: (dir) => ({ 'java.templates': filesUnder(dir).filter((file) => file.endsWith('.nbt')).length })
        },
        {
            label: `Mojang/bedrock-samples at ${sources.bedrockSamples.tag}`,
            dir: path.join(cacheRoot, 'bedrock-samples', sources.bedrockSamples.tag, 'unpacked'),
            names: ['samples.files'],
            read: (dir) => ({ 'samples.files': filesUnder(dir).length })
        },
        {
            label: 'the composed vanilla Bedrock behavior pack',
            dir: path.join(cacheRoot, 'bds', `v${sources.bds.defaultProtocolVersion}`),
            names: [
                'bedrock.entities',
                'bedrock.tradeTables',
                'bedrock.biomes',
                'bedrock.lootTables.entities',
                'bedrock.lootTables.chests',
                'bedrock.lootTables.blocks'
            ],
            // Composed the way the server composes it, so the counts are what the server loads.
            read: async () => {
                const { load } = await import('../../packages/packs/src/index.ts');
                const { resolvePackStack } = await import('../../packages/prismarine/src/content/packStack.ts');
                const { stack } = resolvePackStack({ overlay: false, javaVanilla: false });
                const { definitions } = load(stack);
                const loot = [...definitions.lootTables.keys()];
                const lootIn = (folder: string) =>
                    loot.filter((key) => key.startsWith(`loot_tables/${folder}/`)).length;
                return {
                    'bedrock.entities': definitions.entities.size,
                    'bedrock.tradeTables': definitions.tradeTables.size,
                    'bedrock.biomes': definitions.biomes.size,
                    'bedrock.lootTables.entities': lootIn('entities'),
                    'bedrock.lootTables.chests': lootIn('chests'),
                    'bedrock.lootTables.blocks': lootIn('blocks')
                };
            }
        },
        {
            label: 'the Java entity attribute capture',
            dir: path.join(repoRoot, 'packages', 'bedrock-data', 'src', 'jsp', 'java'),
            names: ['java.entityAttributes'],
            read: (dir) => {
                const attributes: unknown = JSON.parse(readFileSync(path.join(dir, 'entity_attributes.json'), 'utf8'));
                return {
                    'java.entityAttributes':
                        typeof attributes === 'object' && attributes !== null ? Object.keys(attributes).length : 0
                };
            }
        },
        {
            label: 'the mapping loss list',
            dir: path.join(repoRoot, 'packages', 'mapping', 'src'),
            names: ['mapping.bedrockBiomeLosses'],
            read: async () => {
                const { BEDROCK_BIOME_LOSSES } = await import('../../packages/mapping/src/lossList.ts');
                return { 'mapping.bedrockBiomeLosses': BEDROCK_BIOME_LOSSES.length };
            }
        }
    ];
}

/**
 * Every known fact, by name. A fact whose source is not on disk, such as a download the data scripts
 * have not fetched in this checkout, is present with a `null` value: markers for it keep their text.
 */
export interface Facts {
    values: ReadonlyMap<string, string | null>;
    /** The sources that were not on disk, by label. */
    missing: readonly string[];
}

/** Every fact, by name. A marker naming any other fact fails the docs build. */
export async function loadFacts(): Promise<Facts> {
    const project = loadProject();
    // Parsed JSON is an untyped boundary; only the fields `Sources` names are read.
    const sources: Sources = JSON.parse(
        readFileSync(path.join(repoRoot, 'packages', 'bedrock-data', 'sources.json'), 'utf8')
    );
    const bds = sources.bds.versions[sources.bds.defaultProtocolVersion];
    const newest = project.protocols[0];
    const oldest = project.protocols.at(-1) ?? newest;
    const minecraft = project.protocols.toReversed().flatMap(({ minecraft }) => minecraft);

    const values = new Map<string, string | null>(
        Object.entries({
            'server.version': project.version,
            'server.port': String(project.defaultPort),
            'nethernet.lanPort': String(project.netherNetLanPort),
            'nethernet.identityFile': project.netherNetIdentityFile,
            'server.onlineMode': project.onlineMode ? 'on' : 'off',
            'node.minimum': project.engines.node.replace(/^>=\s*/, ''),
            'pnpm.minimum': project.engines.pnpm.replace(/^>=\s*/, ''),
            'packages.count': String(project.packages.length),
            'executables.count': String(project.executables.length),
            'protocol.newest': String(newest.protocol),
            'protocol.oldest': String(oldest.protocol),
            'protocol.list': list(project.protocols.map(({ protocol }) => String(protocol))),
            'minecraft.newest': minecraft.at(-1) ?? '',
            'minecraft.oldest': minecraft[0] ?? '',
            'bds.version': bds.serverVersion,
            'bds.minecraft': bds.minecraftVersion,
            'bds.size': megabytes(bds.sizeInBytes),
            // The packaged server's download cache, written with each platform's placeholders.
            'cache.windows': userCacheDir({ LOCALAPPDATA: '%LOCALAPPDATA%' }, 'win32', '%USERPROFILE%'),
            'cache.macos': userCacheDir({}, 'darwin', '~'),
            'cache.xdg': userCacheDir({ XDG_CACHE_HOME: '$XDG_CACHE_HOME' }, 'linux', '~'),
            'cache.linux': userCacheDir({}, 'linux', '~'),
            'samples.tag': sources.bedrockSamples.tag,
            'java.version': sources.javaServer.version,
            'java.size': megabytes(sources.javaServer.sizeInBytes),
            ...Object.fromEntries(Object.entries(palette).map(([name, { hex }]) => [`palette.${name}`, hex])),
            ...(await commandFacts()),
            ...(await configFacts()),
            ...eventFacts(),
            ...tickBudgetFacts()
        })
    );
    const missing: string[] = [];
    for (const source of dataSources(sources)) {
        if (!existsSync(source.dir)) {
            missing.push(source.label);
            for (const name of source.names) values.set(name, null);
            continue;
        }
        for (const [name, count] of Object.entries(await source.read(source.dir))) values.set(name, String(count));
    }
    return { values, missing };
}

/**
 * A marker with its name and the text it wraps. Names are dotted words, such as `node.minimum`. A
 * marker right after a backtick is an example written in inline code, and is left alone.
 */
const MARKER = /(?<!`)<!-- fact:([\w.-]+) -->([\s\S]*?)<!-- \/fact -->/g;

/** Puts a fact's value in place of the marked text, keeping inline code or a fenced block around it. */
function replaceValue(marked: string, value: string) {
    const fence = /^(\s*)(```+)([^\n]*)\n[\s\S]*?\n\2(\s*)$/.exec(marked);
    if (fence) return `${fence[1]}${fence[2]}${fence[3]}\n${value}\n${fence[2]}${fence[4]}`;
    const code = /^(`+)[\s\S]*\1$/.exec(marked);
    if (code) return `${code[1]}${value}${code[1]}`;
    return value;
}

/** What applying facts to a page did. */
export interface FactsResult {
    text: string;
    /** Marker names with no fact behind them. */
    unknown: string[];
    /** Facts whose marked text in the source differs from the current value. */
    stale: { name: string; was: string; now: string }[];
    /** Facts whose source is not on disk, so their marked text was kept as written. */
    unavailable: string[];
}

/**
 * Fills every marked value in `markdown` with its current fact. `keepMarkers` leaves the comments in,
 * for writing back to the source; without it the markers go, for the published page.
 */
export function applyFacts(
    markdown: string,
    facts: ReadonlyMap<string, string | null>,
    { keepMarkers = false } = {}
): FactsResult {
    const unknown: string[] = [];
    const stale: FactsResult['stale'] = [];
    const unavailable: string[] = [];
    const text = markdown.replace(MARKER, (whole, name: string, marked: string) => {
        const value = facts.get(name);
        if (value === undefined) {
            unknown.push(name);
            return whole;
        }
        if (value === null) unavailable.push(name);
        const filled = value === null ? marked : replaceValue(marked, value);
        if (filled !== marked) stale.push({ name, was: marked.trim(), now: filled.trim() });
        return keepMarkers ? `<!-- fact:${name} -->${filled}<!-- /fact -->` : filled;
    });
    return { text, unknown, stale, unavailable };
}
