import { java_entity_attributes } from '@jsprismarine/bedrock-data';
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';
import { parseLenientJson, readBrarchive } from '@jsprismarine/packs';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createEntityComponentRegistry } from './components';
import type { EntityFile } from './entityTypes';
import { EntityTypes } from './entityTypes';
import { eventActions } from './events';
import type { SharedStat } from './javaStats';
import { JAVA_STAT_EXCEPTIONS, SHARED_STATS, javaEntityStats, statRuling } from './javaStats';
import { TRIGGER_COMPONENTS } from './triggers';
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
 *
 * 423 of them are a type both editions spell the same way. The other 15 belong
 * to the five the pack still names the way Bedrock did before Mojang renamed
 * them, which the comparison reaches through `javaEntityTypeToBedrock`.
 */
const JAVA_STATS_COMPARED = 438;

/**
 * How many of those stats the pack's own values disagree with Java on, before
 * the stat decision in `javaStats.ts` resolves them.
 *
 * The wither has 600 health on Bedrock and 300 on Java, the witch follows from
 * 64 blocks against Java's 16, and most of the hitbox rows are Bedrock rounding
 * a Java height such as 1.95 to 1.9. A change in this count means either a
 * component stopped reading the pack or a golden moved.
 */
const JAVA_STAT_DISAGREEMENTS = 151;

/**
 * How many of those the server resolves to Java's value, which is every
 * disagreement on a stat Java decides that is not a reviewed exception.
 */
const RESOLVED_TO_JAVA = 33;

/**
 * Components the host reads without a component hook.
 */
const RUNTIME_COMPONENTS = [
    'minecraft:persistent',
    'minecraft:transient',
    'minecraft:admire_item',
    'minecraft:barter',
    'minecraft:offspring_data',
    'minecraft:can_climb',
    'minecraft:can_fly',
    'minecraft:can_stand_on_powder_snow',
    'minecraft:can_power_jump',
    'minecraft:dash_action',
    'minecraft:input_ground_controlled',
    'minecraft:free_camera_controlled',
    'minecraft:vertical_movement_action',
    'minecraft:fire_immune',
    'minecraft:out_of_control',
    'minecraft:freezing_immune',
    'minecraft:cannot_be_attacked',
    'minecraft:is_charged',
    'minecraft:is_ignited',
    'minecraft:is_saddled',
    'minecraft:is_chested',
    'minecraft:is_illager_captain',
    'minecraft:is_shaking',
    'minecraft:is_hidden_when_invisible',
    'minecraft:is_stackable',
    'minecraft:is_collidable',
    'minecraft:is_pregnant',
    'minecraft:is_stunned',
    'minecraft:body_rotation_always_follows_head',
    'minecraft:body_rotation_blocked',
    'minecraft:air_drag_modifier',
    'minecraft:bounciness',
    'minecraft:friction_modifier',
    'minecraft:uses_uniform_air_drag',
    'minecraft:renders_when_invisible',
    'minecraft:rotation_axis_aligned',
    'minecraft:rotation_locked_to_vehicle',
    'minecraft:uses_legacy_friction'
];

/** Whether a parsed component body is the `minecraft:collision_box` shape. */
const isCollisionBox = (value: unknown): value is { readonly width: number; readonly height: number } =>
    typeof value === 'object' && value !== null && 'width' in value && 'height' in value;

const isEntityFile = (data: unknown): boolean =>
    typeof data === 'object' && data !== null && 'minecraft:entity' in data;

/** Whether a parsed component's parameters are a JSON object. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

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

    it('reports nothing malformed, because Mojang writes the shapes this package reads', () => {
        // The pack spells "no events" as `"events": null` and "this branch
        // changes nothing" as an empty `"remove": {}`. Both read as what they
        // mean, so a clean start says nothing about either; a warning here is
        // 52 lines of noise that teach an operator to skip the report.
        expect(
            diagnostics.filter((entry) => entry.code === 'entity.invalid' || entry.code === 'event.invalid')
        ).toEqual([]);
    });

    it('pauses vanilla baby growth with the configured golden dandelion', () => {
        const chicken = types.spawn('minecraft:chicken', { cause: 'born' });

        expect(chicken.componentParams('minecraft:ageable')).toMatchObject({
            pauseGrowthItems: ['golden_dandelion'],
            resetGrowthItems: ['golden_dandelion']
        });
        expect(chicken.hasComponent('minecraft:is_baby')).toBe(true);
        expect(chicken.interactWithItem('minecraft:golden_dandelion')).toBe(true);

        for (let tick = 0; tick < 24_001; tick += 1) chicken.tick();

        expect(chicken.hasComponent('minecraft:is_baby')).toBe(true);
    });

    it('drops the vanilla turtle shell piece when a baby grows up', () => {
        const requests: unknown[] = [];
        const turtle = types.spawn('minecraft:turtle', {
            cause: 'born',
            environment: {
                spawnEntity: (_entity, request) => {
                    requests.push(request);
                    return true;
                }
            }
        });

        expect(turtle.componentParams('minecraft:ageable')).toMatchObject({ dropItems: ['turtle_shell_piece'] });
        expect(turtle.hasComponent('minecraft:is_baby')).toBe(true);

        for (let tick = 0; tick < 24_001; tick += 1) turtle.tick();

        expect(requests).toEqual([{ kind: 'item', identifier: 'minecraft:turtle_shell_piece', count: 1 }]);
        expect(turtle.hasComponent('minecraft:is_baby')).toBe(false);
    });

    it('parses the vanilla cow interaction sound from its adult component group', () => {
        const cow = types.registry.get('minecraft:cow');
        if (cow === undefined) throw new Error('the vanilla pack declares no cow');
        const interaction = cow.groups
            .get('minecraft:cow_adult')
            ?.components.find((component) => component.name === 'minecraft:interact')?.params;

        expect(interaction).toMatchObject({ interactions: [expect.objectContaining({ playSounds: ['milk'] })] });
    });

    it('parses the vanilla sheep shearing vibration from its interaction data', () => {
        const sheep = types.registry.get('minecraft:sheep');
        if (sheep === undefined) throw new Error('the vanilla pack declares no sheep');
        const components = [
            ...sheep.components,
            ...[...sheep.groups.values()].flatMap((group) => group.components)
        ].filter((component) => component.name === 'minecraft:interact');

        expect(components.map((component) => component.params)).toContainEqual(
            expect.objectContaining({
                interactions: expect.arrayContaining([expect.objectContaining({ vibration: 'shear' })])
            })
        );
    });

    it('parses the vanilla piglin interaction cooldown after damage', () => {
        const piglin = types.registry.get('minecraft:piglin');
        if (piglin === undefined) throw new Error('the vanilla pack declares no piglin');
        const components = [...piglin.components, ...[...piglin.groups.values()].flatMap((group) => group.components)];
        const interactions = components.flatMap((component) => {
            if (component.name !== 'minecraft:interact' || !isRecord(component.params)) return [];
            return Array.isArray(component.params.interactions) ? component.params.interactions.filter(isRecord) : [];
        });

        expect(interactions).toContainEqual(expect.objectContaining({ cooldownAfterBeingAttacked: 20 }));
    });

    it('parses the vanilla horse equipment inventory slots', () => {
        const horse = types.registry.get('minecraft:horse');
        if (horse === undefined) throw new Error('the vanilla pack declares no horse');
        const components = [...horse.components, ...[...horse.groups.values()].flatMap((group) => group.components)];
        const interactions = components.flatMap((component) => {
            if (component.name !== 'minecraft:interact' || !isRecord(component.params)) return [];
            return Array.isArray(component.params.interactions) ? component.params.interactions.filter(isRecord) : [];
        });

        expect(interactions).toContainEqual(expect.objectContaining({ equipItemSlot: '1', giveItem: false }));
        expect(interactions).toContainEqual(expect.objectContaining({ equipItemSlot: '0', giveItem: false }));
    });

    it('parses Bedrock spawn_items tables and their entity-relative drop offsets', () => {
        const strider = types.registry.get('minecraft:strider');
        if (strider === undefined) throw new Error('the vanilla pack declares no strider');
        const components = [
            ...strider.components,
            ...[...strider.groups.values()].flatMap((group) => group.components)
        ].filter((component) => component.name === 'minecraft:interact');

        expect(components.map((component) => component.params)).toContainEqual(
            expect.objectContaining({
                interactions: expect.arrayContaining([
                    expect.objectContaining({
                        spawnItems: { table: 'loot_tables/entities/saddle.json', yOffset: 1.7 }
                    })
                ])
            })
        );
    });

    it('covers the components the research note predicts and reports what it does not', () => {
        const registry = createEntityComponentRegistry();
        const declared = new Set<string>();
        let componentCovered = 0;

        for (const [, type] of types.registry) {
            for (const name of type.declaredComponents) declared.add(name);
            const missing = type.unimplementedComponents;
            const missingOthers = missing.filter((name) => !name.startsWith('minecraft:behavior.'));
            if (missingOthers.length === 0) componentCovered += 1;
        }

        const goals = [...declared].filter((name) => name.startsWith('minecraft:behavior.'));
        const others = [...declared].filter((name) => !name.startsWith('minecraft:behavior.'));
        const registeredOthers = others.filter((name) => registry.has(name));
        const unimplementedOthers = others.filter((name) => !registry.has(name)).sort();

        const tests = new Set<string>();
        for (const file of files) filterTestsIn(file.data, tests);
        const implementedTests = [...tests].filter(hasFilterTest);

        // Behavior comes from registered hooks, trigger components, and
        // components the runtime reads outside a component callback.
        const withHooks = registry
            .names()
            .filter((name) => !name.startsWith('minecraft:behavior.') && registry.hooksOf(name).size > 0);
        const behavioralComponents = new Set([...withHooks, ...TRIGGER_COMPONENTS, ...RUNTIME_COMPONENTS]);
        const withBehavior = others.filter((name) => behavioralComponents.has(name));

        process.stdout.write(
            [
                `entities: ${types.registry.size}`,
                `non-goal keys in vanilla: ${others.length}, registered: ${registeredOthers.length}`,
                `unregistered non-goal keys: ${unimplementedOthers.join(', ')}`,
                `non-goal keys that carry behavior: ${withBehavior.length}`,
                `goal names in vanilla: ${goals.length} (registration is checked by @jsprismarine/entity-goals)`,
                `entities with every non-goal component registered: ${componentCovered}`,
                `filter tests in vanilla: ${tests.size}, implemented: ${implementedTests.length}`,
                ''
            ].join('\n')
        );

        // Every vanilla non-goal key has a factory. Some factories preserve
        // data without running behavior; the separate count above measures
        // behavior implementations.
        expect(others).toHaveLength(202);
        expect(goals).toHaveLength(170);
        expect(registeredOthers).toHaveLength(202);
        expect(unimplementedOthers).toEqual([]);
        expect(withBehavior).toHaveLength(77);
        expect(componentCovered).toBe(129);
        expect(tests.size).toBe(86);
        expect(implementedTests.length).toBe(tests.size);

        expect(types.spawn('minecraft:warden').componentParams('minecraft:anger_level')).toMatchObject({
            angry_threshold: 80,
            max_anger: 150
        });
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

    it('resolves every stat the two editions disagree on to the edition that decides it', () => {
        /** One entity and stat, with the pack's value and the one the server runs with. */
        interface Measured {
            readonly identifier: string;
            readonly stat: SharedStat;
            readonly pack: number;
            readonly resolved: number;
            readonly java: number;
        }

        const agrees = (left: number, right: number): boolean =>
            Math.abs(left - right) <= Math.max(1e-5, Math.abs(right) * 1e-5);

        const measured: Measured[] = [];

        for (const [javaIdentifier, java] of Object.entries(java_entity_attributes)) {
            // The pack names five of these types the way Bedrock did before Mojang
            // renamed them, so reaching them by Java's name alone would skip them
            // and leave the stat decision untested on every one.
            const mapped = javaEntityTypeToBedrock(javaIdentifier);
            const identifier = mapped.kind === 'mapped' ? mapped.bedrock : javaIdentifier;
            if (!types.registry.has(identifier)) continue;
            const environment = { random: { next: () => 0 } };
            const packEntity = types.spawn(identifier, { environment });
            const entity = types.spawn(identifier, {
                environment: { ...environment, javaStats: java_entity_attributes }
            });
            const box = entity.componentParams('minecraft:collision_box');
            const size = isCollisionBox(box) ? box : undefined;

            const attribute = (stat: SharedStat): readonly [number | undefined, number | undefined] => {
                const authority = SHARED_STATS[stat];
                if (authority.attribute === undefined || authority.javaAttribute === undefined) {
                    return [undefined, undefined];
                }
                return [
                    packEntity.attributes.get(authority.attribute)?.base,
                    entity.attributes.get(authority.attribute)?.base
                ];
            };

            const rows: readonly (readonly [SharedStat, number | undefined, number | undefined, number | undefined])[] =
                [
                    ...(
                        [
                            'max_health',
                            'movement_speed',
                            'attack_damage',
                            'follow_range',
                            'knockback_resistance',
                            'flying_speed',
                            'jump_strength'
                        ] as const
                    ).map((stat) => {
                        const [pack, resolved] = attribute(stat);
                        const authority = SHARED_STATS[stat];
                        const value =
                            authority.javaAttribute === undefined
                                ? undefined
                                : java.attributes[authority.javaAttribute];
                        return [stat, pack, resolved, value] as const;
                    }),
                    ['width', size?.width, size?.width, java.width] as const,
                    ['height', size?.height, size?.height, java.height] as const
                ];

            for (const [stat, pack, resolved, value] of rows) {
                if (pack === undefined || resolved === undefined || value === undefined) continue;
                measured.push({ identifier, stat, pack, resolved, java: value });
            }
        }

        const packDisagreements = measured.filter((row) => !agrees(row.pack, row.java));
        const unresolved = measured.filter((row) => !agrees(row.resolved, row.java));
        const takenFromJava = packDisagreements.filter((row) => agrees(row.resolved, row.java));

        // A disagreement the server still runs on Bedrock's number has to be a
        // stat Bedrock decides or a reviewed exception. Anything else is a
        // defect, not a finding.
        const unreviewed = unresolved.filter((row) => statRuling(row.identifier, row.stat).kind === 'java');

        const byStat = (rows: readonly Measured[]): string =>
            [
                ...rows.reduce(
                    (counts, row) => counts.set(row.stat, (counts.get(row.stat) ?? 0) + 1),
                    new Map<string, number>()
                )
            ]
                .map(([stat, count]) => `${stat} ${count}`)
                .join(', ');

        process.stdout.write(
            [
                `stats compared against Java: ${measured.length}, agreeing: ${measured.length - packDisagreements.length}`,
                `pack disagreements by stat: ${byStat(packDisagreements)}`,
                `resolved to Java's value: ${takenFromJava.length} (${byStat(takenFromJava)})`,
                `keeping Bedrock's value: ${unresolved.length} (${byStat(unresolved)})`,
                ...unresolved.map(
                    (row) =>
                        `  ${row.identifier} ${row.stat}: bedrock ${row.resolved}, java ${row.java} [${statRuling(row.identifier, row.stat).kind}]`
                ),
                ''
            ].join('\n')
        );

        expect(measured).toHaveLength(JAVA_STATS_COMPARED);

        // The two editions genuinely differ on these stats, so the count is a
        // recorded finding. A change means either the components stopped
        // reading the pack or Mojang changed a value.
        expect(packDisagreements).toHaveLength(JAVA_STAT_DISAGREEMENTS);

        expect(unreviewed.map((row) => `${row.identifier} ${row.stat}`)).toEqual([]);
        expect(takenFromJava).toHaveLength(RESOLVED_TO_JAVA);
        expect(unresolved).toHaveLength(JAVA_STAT_DISAGREEMENTS - RESOLVED_TO_JAVA);
    });

    it('applies the decision to an entity the pack names the way Bedrock used to', () => {
        // Java's dump is keyed by Java's name, and these five spawn under an older
        // Bedrock one, so looking the row up by the identifier the entity spawned
        // under used to find nothing and leave them on the pack's numbers. The
        // follow ranges are the two where that showed: Bedrock's evoker follows
        // from 64 blocks and its villager from 128.
        const javaFollowRange = (identifier: string): number | undefined =>
            types
                .spawn(identifier, { environment: { random: { next: () => 0 }, javaStats: java_entity_attributes } })
                .attributes.get('follow_range')?.base;

        for (const identifier of [
            'minecraft:evocation_illager',
            'minecraft:villager_v2',
            'minecraft:zombie_villager_v2',
            'minecraft:tropicalfish',
            'minecraft:zombie_pigman'
        ]) {
            expect(javaEntityStats(identifier, java_entity_attributes), identifier).toBeDefined();
        }

        expect(javaFollowRange('minecraft:evocation_illager')).toBe(12);
        expect(javaFollowRange('minecraft:villager_v2')).toBe(16);
    });

    it('keeps every reviewed exception on a stat the two editions still disagree on', () => {
        for (const row of JAVA_STAT_EXCEPTIONS) {
            const java = javaEntityStats(row.identifier, java_entity_attributes);
            const authority = SHARED_STATS[row.stat];
            expect(java, `${row.identifier} has no Java stats`).toBeDefined();
            expect(authority.decidedBy, `${row.stat} is not a stat Java decides`).toBe('java');

            const entity = types.spawn(row.identifier, {
                environment: { random: { next: () => 0 }, javaStats: java_entity_attributes }
            });
            const resolved =
                authority.attribute === undefined ? undefined : entity.attributes.get(authority.attribute)?.base;
            const value = authority.javaAttribute === undefined ? undefined : java?.attributes[authority.javaAttribute];

            expect(resolved, `${row.identifier} declares no ${row.stat}`).toBeDefined();
            expect(resolved).not.toBe(value);
        }
    });

    it('spawns every entity that declares a spawn event without throwing', () => {
        for (const [identifier] of types.registry) {
            const entity = types.spawn(identifier, { environment: { random: { next: () => 0.5 } } });
            entity.tick();
            expect(entity.type.identifier).toBe(identifier);
        }
    });
});
