// Both modules are imported by path rather than through the package index,
// because node runs this script straight from TypeScript source and the index
// re-exports modules whose extensionless specifiers it cannot resolve.
import { readBrarchive } from '@jsprismarine/packs/brarchive';
import { parseLenientJson } from '@jsprismarine/packs/lenientJson';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Builds `src/generated/goalInventory.json` from the composed vanilla behavior
 * pack.
 *
 * The inventory is what the goal implementations are written against: the real
 * `minecraft:behavior.*` names, how many entity files use each one, the union
 * of parameter keys vanilla writes under each, and which entities carry it. The
 * totality test reads the same file, so a goal that vanilla uses and this
 * package does not register fails the build rather than going unnoticed.
 *
 * It reads the Bedrock Dedicated Server zip or the bedrock-samples checkout
 * that `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` caches.
 * Extracted game files are untrusted input: nothing here executes them, and the
 * lenient JSON parser is the only thing that reads them.
 */

const here = dirname(fileURLToPath(import.meta.url));
const cacheRoot = join(here, '..', '..', '..', 'node_modules', '.cache', 'jsprismarine');
const target = join(here, '..', 'src', 'generated', 'goalInventory.json');

const decoder = new TextDecoder();

const GOAL_PREFIX = 'minecraft:behavior.';

/** The `vanilla*` layer folders of an unpacked BDS, in the order the engine composes them. */
const bedrockServerLayers = () => {
    const root = join(cacheRoot, 'bds');
    if (!existsSync(root)) return [];
    for (const version of readdirSync(root)) {
        const packs = join(root, version, 'unpacked', 'behavior_packs');
        if (!existsSync(packs)) continue;
        const layers = readdirSync(packs)
            .filter((name) => name === 'vanilla' || name.startsWith('vanilla_'))
            .filter((name) => statSync(join(packs, name)).isDirectory())
            .map((name) => ({ name, parts: (name.split('_')[1] ?? '0').split('.').map(Number) }))
            .sort((a, b) => {
                for (let part = 0; part < 3; part += 1) {
                    const order = (a.parts[part] ?? 0) - (b.parts[part] ?? 0);
                    if (order !== 0) return order;
                }
                return a.name.localeCompare(b.name);
            })
            .map((layer) => join(packs, layer.name));
        if (layers.length > 0) return { layers, version };
    }
    return { layers: [], version: 'unknown' };
};

/** The behavior pack folder of a bedrock-samples checkout, which ships 128 of the 129 files. */
const bedrockSamplesPack = () => {
    const root = join(cacheRoot, 'bedrock-samples');
    if (!existsSync(root)) return undefined;
    for (const tag of readdirSync(root)) {
        const unpacked = join(root, tag, 'unpacked');
        if (!existsSync(unpacked)) continue;
        for (const checkout of readdirSync(unpacked)) {
            const pack = join(unpacked, checkout, 'behavior_pack');
            if (existsSync(join(pack, 'entities'))) return { pack, tag };
        }
    }
    return undefined;
};

/** Every `entities/*.json` of one layer, from its brarchive and from a loose folder. */
const layerEntityFiles = (root: string): ReadonlyMap<string, Uint8Array> => {
    const files = new Map<string, Uint8Array>();

    const archive = join(root, '__brarchive', 'entities.brarchive');
    if (existsSync(archive)) {
        for (const [member, bytes] of readBrarchive(readFileSync(archive))) files.set(basename(member), bytes);
    }

    const loose = join(root, 'entities');
    if (existsSync(loose)) {
        for (const name of readdirSync(loose)) {
            if (name.endsWith('.json')) files.set(name, readFileSync(join(loose, name)));
        }
    }

    return files;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** One entity definition, reduced to the identifier and every component map in it. */
interface ParsedEntity {
    readonly identifier: string;
    /** The base `components` map and one map per component group. */
    readonly maps: readonly Record<string, unknown>[];
}

const parseEntity = (data: unknown): ParsedEntity | undefined => {
    if (!isRecord(data)) return undefined;
    const entity = data['minecraft:entity'];
    if (!isRecord(entity)) return undefined;
    const description = isRecord(entity.description) ? entity.description : {};
    const identifier = typeof description.identifier === 'string' ? description.identifier : undefined;
    if (identifier === undefined) return undefined;

    const maps: Record<string, unknown>[] = [];
    if (isRecord(entity.components)) maps.push(entity.components);
    if (isRecord(entity.component_groups)) {
        for (const group of Object.values(entity.component_groups)) if (isRecord(group)) maps.push(group);
    }
    return { identifier, maps };
};

/** The JSON type name the inventory records for an observed parameter value. */
const typeOf = (value: unknown): string => {
    if (Array.isArray(value)) return 'array';
    if (value === null) return 'null';
    if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
    return typeof value;
};

interface ParameterTally {
    instances: number;
    readonly types: Set<string>;
}

interface GoalTally {
    instances: number;
    inBaseComponents: number;
    inComponentGroups: number;
    readonly usedBy: Set<string>;
    readonly parameters: Map<string, ParameterTally>;
}

const source = (() => {
    const bds = bedrockServerLayers();
    if (bds.layers.length > 0) return { roots: bds.layers, label: `Bedrock Dedicated Server ${bds.version}` };
    const samples = bedrockSamplesPack();
    if (samples === undefined) throw new Error('no cached vanilla behavior pack: run bedrock-data fetch:sources');
    return { roots: [samples.pack], label: `bedrock-samples ${samples.tag}` };
})();

const composed = new Map<string, unknown>();
for (const root of source.roots) {
    for (const [name, bytes] of layerEntityFiles(root)) composed.set(name, parseLenientJson(decoder.decode(bytes)));
}

const entities: string[] = [];
const goals = new Map<string, GoalTally>();

for (const data of composed.values()) {
    const parsed = parseEntity(data);
    if (parsed === undefined) continue;
    entities.push(parsed.identifier);

    parsed.maps.forEach((components, index) => {
        for (const [name, body] of Object.entries(components)) {
            if (!name.startsWith(GOAL_PREFIX)) continue;
            const tally = goals.get(name) ?? {
                instances: 0,
                inBaseComponents: 0,
                inComponentGroups: 0,
                usedBy: new Set<string>(),
                parameters: new Map<string, ParameterTally>()
            };
            tally.instances += 1;
            if (index === 0) tally.inBaseComponents += 1;
            else tally.inComponentGroups += 1;
            tally.usedBy.add(parsed.identifier);
            if (isRecord(body)) {
                for (const [key, value] of Object.entries(body)) {
                    const parameter = tally.parameters.get(key) ?? { instances: 0, types: new Set<string>() };
                    parameter.instances += 1;
                    parameter.types.add(typeOf(value));
                    tally.parameters.set(key, parameter);
                }
            }
            goals.set(name, tally);
        }
    });
}

const inventory = {
    source: source.label,
    entityCount: entities.length,
    goalCount: goals.size,
    entities: entities.sort(),
    goals: [...goals.entries()]
        .sort((a, b) => b[1].usedBy.size - a[1].usedBy.size || a[0].localeCompare(b[0]))
        .map(([name, tally]) => ({
            name,
            entities: tally.usedBy.size,
            instances: tally.instances,
            inBaseComponents: tally.inBaseComponents,
            inComponentGroups: tally.inComponentGroups,
            parameters: [...tally.parameters.entries()]
                .sort((a, b) => b[1].instances - a[1].instances || a[0].localeCompare(b[0]))
                .map(([key, parameter]) => ({
                    key,
                    instances: parameter.instances,
                    types: [...parameter.types].sort()
                })),
            usedBy: [...tally.usedBy].sort()
        }))
};

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(inventory, null, 4)}\n`);

process.stdout.write(`${source.label}: ${inventory.entityCount} entities, ${inventory.goalCount} goals -> ${target}\n`);
