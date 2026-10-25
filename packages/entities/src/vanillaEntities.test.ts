import { java_entity_attributes } from '@jsprismarine/bedrock-data';
import { parseLenientJson, readBrarchive } from '@jsprismarine/packs';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createEntityComponentRegistry } from './components';
import type { EntityFile } from './entityTypes';
import { EntityTypes } from './entityTypes';
import { eventActions } from './events';
import { hasFilterTest } from './filters';

/**
 * Runs the package over the real vanilla entity definitions.
 *
 * It needs the Bedrock Dedicated Server zip or the bedrock-samples checkout
 * that `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` caches, so
 * it only runs with JSP_VANILLA_ENTITIES set. Extracted game files are
 * untrusted input: nothing here executes them, and the lenient JSON parser is
 * the only thing that reads them.
 */

const enabled = !!process.env.JSP_VANILLA_ENTITIES;

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

/** The behavior pack folder of a bedrock-samples checkout, which ships 128 of the 129 files. */
const bedrockSamplesPack = (): string | undefined => {
    const root = join(cacheRoot, 'bedrock-samples');
    if (!existsSync(root)) return undefined;
    for (const tag of readdirSync(root)) {
        const unpacked = join(root, tag, 'unpacked');
        if (!existsSync(unpacked)) continue;
        for (const checkout of readdirSync(unpacked)) {
            const pack = join(unpacked, checkout, 'behavior_pack');
            if (existsSync(join(pack, 'entities'))) return pack;
        }
    }
    return undefined;
};

/**
 * How many stats both editions publish for the same entity, over the 93 Java
 * types the golden holds and the 129 Bedrock definitions.
 */
const JAVA_STATS_COMPARED = 423;

/**
 * How many of those stats the two editions disagree on.
 *
 * These are findings, not defects. The wither has 600 health on Bedrock and
 * 300 on Java, the witch follows from 64 blocks against Java's 16, and most of
 * the hitbox rows are Bedrock rounding a Java height such as 1.95 to 1.9. The
 * `attack_damage` rows are partly a modeling difference: Bedrock writes a
 * `{range_min, range_max}` pair where Java writes one number, and the
 * comparison reads the low end. A change in this count means either a
 * component stopped reading the pack or a golden moved.
 */
const JAVA_STAT_DISAGREEMENTS = 144;

/** Whether a parsed component body is the `minecraft:collision_box` shape. */
const isCollisionBox = (value: unknown): value is { readonly width: number; readonly height: number } =>
    typeof value === 'object' && value !== null && 'width' in value && 'height' in value;

const isEntityFile = (data: unknown): boolean =>
    typeof data === 'object' && data !== null && 'minecraft:entity' in data;

/** Every `entities/*.json` of one layer, from its brarchive and from a loose folder. */
const layerEntityFiles = (root: string): ReadonlyMap<string, Uint8Array> => {
    const files = new Map<string, Uint8Array>();

    const archive = join(root, '__brarchive', 'entities.brarchive');
    if (existsSync(archive)) {
        for (const [member, bytes] of readBrarchive(readFileSync(archive))) {
            files.set(basename(member), bytes);
        }
    }

    const loose = join(root, 'entities');
    if (existsSync(loose)) {
        for (const name of readdirSync(loose)) {
            if (name.endsWith('.json')) files.set(name, readFileSync(join(loose, name)));
        }
    }

    return files;
};

/**
 * Composes the vanilla entity files: a later layer replaces an earlier file of
 * the same name.
 *
 * This reads `__brarchive/entities.brarchive` directly rather than through
 * `expandSource`, because the loader expands a brarchive inside a subfolder to
 * the archive's own name: `__brarchive/loot_tables/entities.brarchive` lands
 * on `entities/`, where its loot tables collide with the entity definitions of
 * the same name.
 *
 * A few files under `entities/` are not entity definitions, such as the
 * `sniffer_seeds` and `armadillo_brush` tables, and they are skipped.
 */
const composeVanillaEntities = (): readonly EntityFile[] => {
    const layers = bedrockServerLayers();
    const roots = layers.length > 0 ? layers : [bedrockSamplesPack()].filter((path) => path !== undefined);
    const files = new Map<string, EntityFile>();

    for (const root of roots) {
        for (const [name, bytes] of layerEntityFiles(root)) {
            const data = parseLenientJson(decoder.decode(bytes));
            if (!isEntityFile(data)) continue;
            files.set(name, { data, pack: root, path: `entities/${name}` });
        }
    }

    return [...files.values()];
};

/** Every filter test name a value mentions, however deeply it nests. */
const filterTestsIn = (value: unknown, found: Set<string>): void => {
    if (Array.isArray(value)) {
        for (const member of value) filterTestsIn(member, found);
        return;
    }
    if (typeof value !== 'object' || value === null) return;
    for (const [key, member] of Object.entries(value)) {
        if (key === 'test' && typeof member === 'string') found.add(member);
        else filterTestsIn(member, found);
    }
};

describe.runIf(enabled)('the vanilla entity pack', () => {
    const files = composeVanillaEntities();
    const types = new EntityTypes();
    const diagnostics = types.load(files);

    it('composes at least the 128 entity files bedrock-samples ships', () => {
        expect(files.length).toBeGreaterThanOrEqual(128);
    });

    it('parses every file without an error', () => {
        const errors = diagnostics.filter((entry) => entry.severity === 'error');

        expect(errors).toEqual([]);
        expect(types.registry.size).toBe(files.length);
    });

    it('reports no unknown top-level or description key', () => {
        expect(diagnostics.filter((entry) => entry.code === 'entity.unknownKey')).toEqual([]);
    });

    it('covers the components the research note predicts and reports what it does not', () => {
        const registry = createEntityComponentRegistry();
        const declared = new Set<string>();
        let componentCovered = 0;
        let goalCovered = 0;
        let fullyCovered = 0;

        for (const [, type] of types.registry) {
            for (const name of type.declaredComponents) declared.add(name);
            const missing = type.unimplementedComponents;
            const missingGoals = missing.filter((name) => name.startsWith('minecraft:behavior.'));
            const missingOthers = missing.filter((name) => !name.startsWith('minecraft:behavior.'));
            if (missingOthers.length === 0) componentCovered += 1;
            if (missingGoals.length === 0) goalCovered += 1;
            if (missing.length === 0) fullyCovered += 1;
        }

        const goals = [...declared].filter((name) => name.startsWith('minecraft:behavior.'));
        const others = [...declared].filter((name) => !name.startsWith('minecraft:behavior.'));
        const implementedOthers = others.filter((name) => registry.has(name));
        const implementedGoals = goals.filter((name) => registry.has(name));

        const tests = new Set<string>();
        for (const file of files) filterTestsIn(file.data, tests);
        const implementedTests = [...tests].filter(hasFilterTest);

        process.stdout.write(
            [
                `entities: ${types.registry.size}`,
                `non-goal keys in vanilla: ${others.length}, implemented: ${implementedOthers.length}`,
                `goals in vanilla: ${goals.length}, implemented: ${implementedGoals.length}`,
                `entities with every non-goal component implemented: ${componentCovered}`,
                `entities with every goal implemented: ${goalCovered}`,
                `entities fully covered: ${fullyCovered}`,
                `filter tests in vanilla: ${tests.size}, implemented: ${implementedTests.length}`,
                ''
            ].join('\n')
        );

        // The research note measures that the 140 most used non-goal keys
        // cover 88 of the 129 entities. This package implements every key two
        // or more entities use, 157 of the 202, which covers 102, and every
        // filter test vanilla uses.
        expect(others).toHaveLength(202);
        expect(goals).toHaveLength(170);
        expect(implementedOthers.length).toBeGreaterThanOrEqual(157);
        expect(componentCovered).toBeGreaterThanOrEqual(102);
        expect(tests.size).toBe(86);
        expect(implementedTests.length).toBe(tests.size);
    });

    it('parses every event action the pack writes into one it carries out', () => {
        const uses = new Map<string, number>();
        const unparsed = new Set<string>();

        for (const [, type] of types.registry) {
            for (const [, node] of type.entity.events) {
                for (const action of eventActions(node)) {
                    uses.set(action.name, (uses.get(action.name) ?? 0) + 1);
                    if (action.parsed === undefined) unparsed.add(action.name);
                }
            }
        }

        process.stdout.write(
            `event actions in vanilla: ${[...uses].map(([name, count]) => `${name} ${count}`).join(', ')}\n`
        );

        // The eight keys the composed pack writes, by uses. `queue_command`
        // is the ninth the package carries out and no vanilla entity uses.
        expect(Object.fromEntries(uses)).toEqual({
            play_sound: 23,
            set_home_position: 17,
            emit_vibration: 9,
            drop_item: 2,
            execute_event_on_home_block: 2,
            emit_particle: 1,
            reset_target: 1,
            stop_movement: 1
        });
        expect([...unparsed]).toEqual([]);
    });

    it('measures the Bedrock stats against Java Edition and names every disagreement', () => {
        const disagreements: string[] = [];
        let compared = 0;
        let agreed = 0;

        for (const [identifier, java] of Object.entries(java_entity_attributes)) {
            if (!types.registry.has(identifier)) continue;
            const entity = types.spawn(identifier, { environment: { random: { next: () => 0 } } });
            const box = entity.componentParams('minecraft:collision_box');
            const size = isCollisionBox(box) ? box : undefined;

            const measured: readonly (readonly [string, number | undefined, number | undefined])[] = [
                ['max_health', entity.attributes.get('health')?.base, java.attributes['minecraft:max_health']],
                ['movement_speed', entity.attributes.get('movement')?.base, java.attributes['minecraft:movement_speed']],
                ['attack_damage', entity.attributes.get('attack_damage')?.base, java.attributes['minecraft:attack_damage']],
                ['follow_range', entity.attributes.get('follow_range')?.base, java.attributes['minecraft:follow_range']],
                ['knockback_resistance', entity.attributes.get('knockback_resistance')?.base, java.attributes['minecraft:knockback_resistance']],
                ['flying_speed', entity.attributes.get('flying_speed')?.base, java.attributes['minecraft:flying_speed']],
                ['jump_strength', entity.attributes.get('jump_strength')?.base, java.attributes['minecraft:jump_strength']],
                ['width', size?.width, java.width],
                ['height', size?.height, java.height]
            ];

            for (const [stat, bedrock, value] of measured) {
                if (bedrock === undefined || value === undefined) continue;
                compared += 1;
                if (Math.abs(bedrock - value) <= Math.max(1e-5, Math.abs(value) * 1e-5)) agreed += 1;
                else disagreements.push(`${identifier} ${stat}: bedrock ${bedrock}, java ${value}`);
            }
        }

        const byStat = new Map<string, number>();
        for (const line of disagreements) {
            const stat = line.split(' ')[1]?.replace(':', '') ?? '';
            byStat.set(stat, (byStat.get(stat) ?? 0) + 1);
        }

        process.stdout.write(
            [
                `stats compared against Java: ${compared}, agreeing: ${agreed}`,
                `disagreements by stat: ${[...byStat].map(([stat, count]) => `${stat} ${count}`).join(', ')}`,
                ...disagreements.map((line) => `  ${line}`),
                ''
            ].join('\n')
        );

        // The two editions genuinely differ on these stats, so the count is a
        // recorded finding rather than a target. A change here means either
        // the components stopped reading the pack or Mojang changed a value.
        expect(compared).toBe(JAVA_STATS_COMPARED);
        expect(disagreements).toHaveLength(JAVA_STAT_DISAGREEMENTS);
    });

    it('spawns every entity that declares a spawn event without throwing', () => {
        for (const [identifier] of types.registry) {
            const entity = types.spawn(identifier, { environment: { random: { next: () => 0.5 } } });
            entity.tick();
            expect(entity.type.identifier).toBe(identifier);
        }
    });
});
