import type { Diagnostic } from '@jsprismarine/entities';
import { parseLenientJson, readBrarchive } from '@jsprismarine/packs';
import { seededRandom } from '@jsprismarine/predicates';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SPAWN_CONSTANTS } from './constants';
import type { SpawnRule } from './rules';
import { SPAWN_RULE_COMPONENTS, parseSpawnRule } from './rules';
import { Spawner } from './spawner';
import type { SpawnPosition, SpawnSiteFlag, SpawnWorld } from './world';

/**
 * Runs the package over the real vanilla spawn rules.
 *
 * It needs the Bedrock Dedicated Server zip or the bedrock-samples checkout
 * that `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` caches, so
 * it only runs with JSP_VANILLA_SPAWN_RULES set. Extracted game files are
 * untrusted input: nothing here executes them, and the lenient JSON parser is
 * the only thing that reads them, because several vanilla spawn rules carry
 * `//` comments.
 */

const enabled = !!process.env.JSP_VANILLA_SPAWN_RULES;

const cacheRoot = join(import.meta.dirname, '..', '..', '..', 'node_modules', '.cache', 'jsprismarine');

const decoder = new TextDecoder();

/** The `vanilla*` layer folders of an unpacked BDS, in the order the engine composes them. */
const bedrockServerLayers = (): readonly string[] => {
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
        if (layers.length > 0) return layers;
    }
    return [];
};

/** The behavior pack folder of a bedrock-samples checkout, which ships all 60 files. */
const bedrockSamplesPack = (): string | undefined => {
    const root = join(cacheRoot, 'bedrock-samples');
    if (!existsSync(root)) return undefined;
    for (const tag of readdirSync(root)) {
        const unpacked = join(root, tag, 'unpacked');
        if (!existsSync(unpacked)) continue;
        for (const checkout of readdirSync(unpacked)) {
            const pack = join(unpacked, checkout, 'behavior_pack');
            if (existsSync(join(pack, 'spawn_rules'))) return pack;
        }
    }
    return undefined;
};

/** Every `spawn_rules/*.json` of one layer, from its brarchive and from a loose folder. */
const layerSpawnRuleFiles = (root: string): ReadonlyMap<string, Uint8Array> => {
    const files = new Map<string, Uint8Array>();

    const archive = join(root, '__brarchive', 'spawn_rules.brarchive');
    if (existsSync(archive)) {
        for (const [member, bytes] of readBrarchive(readFileSync(archive))) files.set(basename(member), bytes);
    }

    const loose = join(root, 'spawn_rules');
    if (existsSync(loose)) {
        for (const name of readdirSync(loose)) {
            if (name.endsWith('.json')) files.set(name, readFileSync(join(loose, name)));
        }
    }

    return files;
};

interface ComposedRule {
    readonly name: string;
    readonly data: unknown;
    readonly pack: string;
}

/** Composes the vanilla spawn rules: a later layer replaces an earlier file of the same name. */
const composeVanillaSpawnRules = (): readonly ComposedRule[] => {
    const layers = bedrockServerLayers();
    const roots = layers.length > 0 ? layers : [bedrockSamplesPack()].filter((path) => path !== undefined);
    const files = new Map<string, ComposedRule>();

    for (const root of roots) {
        for (const [name, bytes] of layerSpawnRuleFiles(root)) {
            const text = decoder.decode(bytes);
            // The nine binary `\x7fMCB` trade files have no spawn rule
            // counterpart, but guard anyway so one unreadable file names itself.
            if (text.startsWith('\u007fMCB')) continue;
            files.set(name, { name, data: parseLenientJson(text), pack: root });
        }
    }

    return [...files.values()];
};

/** A world that answers yes to everything, so the loop exercises every rule. */
const permissiveWorld = {
    site: (flag: SpawnSiteFlag, at: SpawnPosition) => (at.y >= 64 ? flag === 'surface' : flag === 'underground'),
    block: () => 'minecraft:grass_block',
    light: () => 7,
    biomeTags: () => ['plains', 'overworld', 'ocean', 'monster', 'animal', 'nether', 'mesa'],
    biome: () => 'minecraft:plains',
    surfaceY: () => 64,
    minY: () => -64,
    players: () => [{ position: { x: 0, y: 64, z: 0 } }],
    poolCount: () => 0,
    typeCount: () => 0,
    difficulty: () => 'normal' as const,
    weather: () => 'clear' as const,
    age: () => 100_000,
    mobEventActive: () => true,
    villageBorderDistance: () => 4
} satisfies SpawnWorld;

describe.runIf(enabled)('the vanilla spawn rules', () => {
    const files = composeVanillaSpawnRules();
    const diagnostics: Diagnostic[] = [];
    const rules: SpawnRule[] = [];

    for (const file of files) {
        const rule = parseSpawnRule(file.data, {
            pack: file.pack,
            path: `spawn_rules/${file.name}`,
            report: (diagnostic) => diagnostics.push(diagnostic)
        });
        if (rule !== undefined) rules.push(rule);
    }

    it('composes the 60 vanilla spawn rules', () => {
        expect(files).toHaveLength(60);
        expect(rules).toHaveLength(60);
    });

    it('parses every file with no diagnostic at all', () => {
        expect(diagnostics).toEqual([]);
    });

    it('uses 21 of the 24 components the schema declares', () => {
        const used = new Set<string>();
        for (const file of files) {
            const body = file.data as { 'minecraft:spawn_rules'?: { conditions?: Record<string, unknown>[] } };
            for (const condition of body['minecraft:spawn_rules']?.conditions ?? [])
                for (const key of Object.keys(condition)) used.add(key);
        }

        expect(used.size).toBe(21);
        for (const key of used) expect(SPAWN_RULE_COMPONENTS).toContain(key);
    });

    it('fills the six population pools the research note measured', () => {
        const pools = new Map<string, number>();
        for (const rule of rules) {
            const pool = rule.populationControl ?? 'none';
            pools.set(pool, (pools.get(pool) ?? 0) + 1);
        }

        expect(Object.fromEntries(pools)).toEqual({
            animal: 27,
            monster: 24,
            water_animal: 5,
            pillager: 2,
            cat: 1,
            ambient: 1
        });
    });

    it('leaves exactly four rules without conditions', () => {
        const bare = rules.filter((rule) => rule.conditions.length === 0).map((rule) => rule.identifier);

        expect(bare.sort()).toEqual([
            'minecraft:blaze',
            'minecraft:cat',
            'minecraft:pillager',
            'minecraft:wither_skeleton'
        ]);
    });

    it('runs the whole rule set through one cycle of every pool', () => {
        const spawner = new Spawner({ rules, world: permissiveWorld, random: seededRandom(1234) });
        const spawned = spawner.pools.flatMap((pool) => spawner.cycle(pool, 0));

        expect(spawned.length).toBeGreaterThan(0);
        for (const request of spawned) expect(request.identifier.startsWith('minecraft:')).toBe(true);
    });

    it('answers every biome filter test the rules write', () => {
        const unanswered: string[] = [];
        const spawner = new Spawner({
            rules,
            world: permissiveWorld,
            random: seededRandom(99),
            onUnanswered: (test, reason) => unanswered.push(`${test.test}:${reason}`)
        });
        for (const pool of spawner.pools) spawner.cycle(pool, 0);

        expect([...new Set(unanswered)]).toEqual([]);
    });

    it('keeps the constants table honest about its provenance', () => {
        expect(SPAWN_CONSTANTS.provenance).toContain('no cap value');
    });
});
