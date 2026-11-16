import { EntityTypes } from '@jsprismarine/entities';
import type { EntityInstance } from '@jsprismarine/entities/entityInstance';
import { describe, expect, it } from 'vitest';

import { javaSpawnRulings, withJavaSpawnEvents } from './javaSpawnEvents';

const add = (...groups: string[]) => ({ add: { component_groups: groups } });
const variant = (value: number) => ({ 'minecraft:variant': { value } });

const entityFile = (
    identifier: string,
    groups: Record<string, Record<string, unknown>>,
    events: Record<string, unknown>
) => ({
    format_version: '1.21.0',
    'minecraft:entity': {
        description: { identifier, is_spawnable: true, is_summonable: true },
        components: {},
        component_groups: groups,
        events
    }
});

/** Loads one file through the overlay and the real loader. */
const loaded = (data: ReturnType<typeof entityFile>, identifier: string): EntityTypes => {
    const types = new EntityTypes();
    types.load([{ data: withJavaSpawnEvents(data, javaSpawnRulings()), pack: 'test', path: 'entities/test.json' }]);
    if (!types.registry.has(identifier)) throw new Error(`${identifier} did not load`);
    return types;
};

/**
 * Spawns `steps` entities with every draw of a spawn returning the same evenly spaced roll, in a
 * biome with the given tags, and counts what `read` makes of each.
 */
const sweep = (
    types: EntityTypes,
    identifier: string,
    read: (entity: EntityInstance) => string,
    steps: number,
    biomeTags: readonly string[] = []
): ReadonlyMap<string, number> => {
    const counts = new Map<string, number>();
    for (let step = 0; step < steps; step++) {
        const roll = (step + 0.5) / steps;
        const entity = types.spawn(identifier, {
            environment: {
                random: { next: () => roll },
                filterContext: () => ({
                    self: { names: (name) => (name === 'has_biome_tag' ? biomeTags : undefined) }
                })
            }
        });
        entity.applyQueuedEvents();
        const key = read(entity);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
};

const groupsOf =
    (...watched: string[]) =>
    (entity: EntityInstance): string =>
        watched.filter((group) => entity.activeComponentGroups().includes(group)).join(',') || 'none';

const variantOf = (entity: EntityInstance): string => {
    const params = entity.componentParams('minecraft:variant');
    return JSON.stringify(typeof params === 'object' && params !== null && 'value' in params ? params.value : params);
};

const spider = (identifier: string) =>
    entityFile(
        identifier,
        {
            'minecraft:spider_neutral': {},
            'minecraft:spider_jockey': { 'minecraft:addrider': { entity_type: 'minecraft:skeleton' } },
            'minecraft:spider_stray_jockey': { 'minecraft:addrider': { entity_type: 'minecraft:stray' } },
            'minecraft:spider_bogged_jockey': { 'minecraft:addrider': { entity_type: 'minecraft:bogged' } },
            'minecraft:spider_parched_jockey': { 'minecraft:addrider': { entity_type: 'minecraft:parched' } },
            'minecraft:spider_wither_jockey': { 'minecraft:addrider': { entity_type: 'minecraft:wither_skeleton' } }
        },
        {
            'minecraft:entity_spawned': {
                randomize: [
                    {
                        weight: 1,
                        randomize: [
                            { weight: 80, trigger: 'minecraft:entity_spawned_with_biome_specific_jockey' },
                            { weight: 20, trigger: 'minecraft:entity_spawned_with_default_jockey' }
                        ]
                    },
                    { weight: 99, ...add('minecraft:spider_neutral') }
                ]
            },
            'minecraft:entity_spawned_with_default_jockey': {
                filters: { test: 'is_daytime', value: false },
                ...add('minecraft:spider_jockey', 'minecraft:spider_neutral')
            },
            'minecraft:entity_spawned_with_biome_specific_jockey': {
                first_valid: [
                    {
                        filters: { test: 'has_biome_tag', value: 'nether' },
                        ...add('minecraft:spider_wither_jockey', 'minecraft:spider_neutral')
                    },
                    { trigger: 'minecraft:entity_spawned_with_default_jockey' }
                ]
            }
        }
    );

describe('withJavaSpawnEvents', () => {
    it('seats a skeleton on one spider in a hundred whatever the biome, and nothing else', () => {
        const types = loaded(spider('minecraft:spider'), 'minecraft:spider');
        const jockeys = sweep(types, 'minecraft:spider', groupsOf('minecraft:spider_jockey'), 1000, ['nether']);

        expect(jockeys.get('minecraft:spider_jockey')).toBe(10);
        const declared = types.registry.get('minecraft:spider')?.groups;
        expect([...(declared?.keys() ?? [])].sort()).toEqual(['minecraft:spider_jockey', 'minecraft:spider_neutral']);
    });

    it('never seats a rider on a cave spider', () => {
        const types = loaded(spider('minecraft:cave_spider'), 'minecraft:cave_spider');
        const jockeys = sweep(types, 'minecraft:cave_spider', groupsOf('minecraft:spider_neutral'), 200);

        expect(jockeys).toEqual(new Map([['minecraft:spider_neutral', 200]]));
        expect(types.registry.get('minecraft:cave_spider')?.declaredComponents).not.toContain('minecraft:addrider');
    });

    it("rolls a strider's jockeys with Java's odds among its adults", () => {
        const groups = ['adult', 'piglin_jockey', 'parent_jockey', 'baby'];
        const types = loaded(
            entityFile('minecraft:strider', Object.fromEntries(groups.map((group) => [group, {}])), {
                'minecraft:entity_spawned': {
                    randomize: [
                        { weight: 40, trigger: 'spawn_adult' },
                        { weight: 2, trigger: 'spawn_adult_piglin_jockey' },
                        { weight: 8, trigger: 'spawn_adult_parent_jockey' },
                        { weight: 50, trigger: 'spawn_baby' }
                    ]
                },
                spawn_adult: add('adult'),
                spawn_adult_piglin_jockey: add('piglin_jockey'),
                spawn_adult_parent_jockey: add('parent_jockey'),
                spawn_baby: add('baby')
            }),
            'minecraft:strider'
        );

        // Of 300 adults, nextInt(30) == 0 seats 10 piglins and nextInt(10) == 0 29 of the rest.
        expect(sweep(types, 'minecraft:strider', groupsOf(...groups), 600)).toEqual(
            new Map([
                ['adult', 261],
                ['piglin_jockey', 10],
                ['parent_jockey', 29],
                ['baby', 300]
            ])
        );
    });

    it("draws a rabbit's coat from Java's table by biome tag", () => {
        const coats = { coat_brown: 0, coat_white: 1, coat_black: 2, coat_splotched: 3, coat_desert: 4, coat_salt: 5 };
        const types = loaded(
            entityFile(
                'minecraft:rabbit',
                Object.fromEntries(Object.entries(coats).map(([group, value]) => [group, variant(value)])),
                {
                    'minecraft:entity_spawned': {
                        sequence: [
                            {
                                filters: { test: 'has_component', operator: '!=', value: 'minecraft:variant' },
                                randomize: [
                                    { weight: 50, ...add('coat_brown') },
                                    { weight: 40, ...add('coat_black') },
                                    { weight: 10, ...add('coat_salt') }
                                ]
                            },
                            { filters: { test: 'is_biome', value: 'desert' }, ...add('coat_desert') },
                            {
                                filters: { test: 'is_snow_covered', value: true },
                                randomize: [
                                    { weight: 80, ...add('coat_white') },
                                    { weight: 20, ...add('coat_splotched') }
                                ]
                            }
                        ]
                    }
                }
            ),
            'minecraft:rabbit'
        );

        expect(sweep(types, 'minecraft:rabbit', variantOf, 100)).toEqual(
            new Map([
                ['0', 50],
                ['5', 40],
                ['2', 10]
            ])
        );
        expect(sweep(types, 'minecraft:rabbit', variantOf, 100, ['spawns_white_rabbits'])).toEqual(
            new Map([
                ['1', 80],
                ['3', 20]
            ])
        );
        expect(sweep(types, 'minecraft:rabbit', variantOf, 10, ['spawns_gold_rabbits'])).toEqual(new Map([['4', 10]]));
    });

    it('makes a fox a snow fox by the spawns_snow_foxes biome tag', () => {
        const types = loaded(
            entityFile(
                'minecraft:fox',
                { 'minecraft:fox_red': variant(0), 'minecraft:fox_arctic': variant(1) },
                {
                    'minecraft:entity_spawned': {
                        sequence: [
                            { filters: { test: 'is_snow_covered', value: true }, ...add('minecraft:fox_arctic') },
                            { filters: { test: 'is_snow_covered', value: false }, ...add('minecraft:fox_red') }
                        ]
                    }
                }
            ),
            'minecraft:fox'
        );

        expect(sweep(types, 'minecraft:fox', variantOf, 4, ['spawns_snow_foxes'])).toEqual(new Map([['1', 4]]));
        expect(sweep(types, 'minecraft:fox', variantOf, 4, ['taiga'])).toEqual(new Map([['0', 4]]));
    });

    it('spawns a villager without a profession', () => {
        const types = loaded(
            entityFile(
                'minecraft:villager_v2',
                {
                    adult: {},
                    unskilled: variant(0),
                    farmer: variant(1),
                    cleric: variant(9),
                    behavior_peasant: {},
                    basic_schedule: {}
                },
                {
                    'minecraft:entity_spawned': {
                        sequence: [
                            add('adult'),
                            {
                                randomize: [
                                    { weight: 1, ...add('farmer', 'behavior_peasant', 'basic_schedule') },
                                    { weight: 1, ...add('cleric', 'basic_schedule') }
                                ]
                            }
                        ]
                    }
                }
            ),
            'minecraft:villager_v2'
        );

        expect(sweep(types, 'minecraft:villager_v2', variantOf, 20)).toEqual(new Map([['0', 20]]));
    });

    it("spawns Java's common tropical fish nine times in ten, and a random one of all sixteen colors otherwise", () => {
        const colors = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray'];
        const base = Object.fromEntries(colors.map((color, value) => [`minecraft:tropicalfish_base_${color}`, value]));
        const pattern = Object.fromEntries(
            colors.map((color, value) => [`minecraft:tropicalfish_pattern_${color}`, value])
        );
        const data = entityFile(
            'minecraft:tropicalfish',
            {
                adult: {},
                ...Object.fromEntries(
                    Object.entries(base).map(([group, value]) => [group, { 'minecraft:color': { value } }])
                ),
                ...Object.fromEntries(
                    Object.entries(pattern).map(([group, value]) => [group, { 'minecraft:color2': { value } }])
                ),
                'minecraft:blue_dory': { 'minecraft:variant': { value: 0 } }
            },
            {
                'minecraft:entity_spawned': {
                    sequence: [
                        add('adult'),
                        { randomize: Object.keys(base).map((group) => ({ weight: 1, ...add(group) })) },
                        { randomize: Object.keys(pattern).map((group) => ({ weight: 1, ...add(group) })) }
                    ]
                }
            }
        );
        const rewritten = withJavaSpawnEvents(data, javaSpawnRulings());

        expect(rewritten).toMatchObject({
            'minecraft:entity': {
                component_groups: {
                    // Java's Blue Tang is a gray flopper with blue stripes, where Bedrock writes a small fish.
                    'minecraft:blue_dory': {
                        'minecraft:variant': { value: 1 },
                        'minecraft:mark_variant': { value: 0 },
                        'minecraft:color': { value: 7 },
                        'minecraft:color2': { value: 11 }
                    },
                    'minecraft:tropicalfish_base_black': { 'minecraft:color': { value: 15 } },
                    'minecraft:tropicalfish_pattern_black': { 'minecraft:color2': { value: 15 } }
                },
                events: {
                    'minecraft:entity_spawned': {
                        sequence: [
                            add('adult'),
                            {
                                randomize: [
                                    {
                                        weight: 9,
                                        randomize: expect.arrayContaining([
                                            { weight: 1, trigger: 'minecraft:become_blue_dory' }
                                        ])
                                    },
                                    {
                                        weight: 1,
                                        sequence: [
                                            {
                                                randomize: expect.arrayContaining([
                                                    { weight: 1, ...add('minecraft:tropicalfish_base_black') }
                                                ])
                                            },
                                            {
                                                randomize: expect.arrayContaining([
                                                    { weight: 1, ...add('minecraft:tropicalfish_pattern_black') }
                                                ])
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                }
            }
        });
    });

    it('spawns a lone sulfur cube grown, and leaves the small roll to its herd mates', () => {
        const types = loaded(
            entityFile(
                'minecraft:sulfur_cube',
                { small: variant(1), medium: variant(2) },
                {
                    'minecraft:entity_spawned': {
                        randomize: [
                            { weight: 5, trigger: 'minecraft:spawn_small' },
                            { weight: 95, trigger: 'minecraft:spawn_medium' }
                        ]
                    },
                    'minecraft:spawn_small': add('small'),
                    'minecraft:spawn_medium': add('medium')
                }
            ),
            'minecraft:sulfur_cube'
        );

        expect(sweep(types, 'minecraft:sulfur_cube', variantOf, 100)).toEqual(new Map([['2', 100]]));
        const member = (roll: number) => {
            const entity = types.spawn('minecraft:sulfur_cube', {
                event: 'jsprismarine:spawn_group_member',
                environment: { random: { next: () => roll } }
            });
            entity.applyQueuedEvents();
            return variantOf(entity);
        };
        expect([member(0.01), member(0.5)]).toEqual(['1', '2']);
    });

    it('leaves a file no ruling names unchanged', () => {
        const data = entityFile('test:spider', {}, { 'minecraft:entity_spawned': add('x') });
        expect(withJavaSpawnEvents(data, javaSpawnRulings())).toBe(data);
    });
});
