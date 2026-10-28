/**
 * A content set small enough to build in memory.
 *
 * The default pack stack is Mojang's two fetched halves, and nothing in CI
 * should need them. This builds the same `ServerContent` out of a handful of
 * definitions and a two-block palette, through the real loaders, the real
 * behavior families and the real flattening, so a test exercises the
 * composition rather than a mock of it.
 */
import { BlockPalette, BlockStateModel, behaviorFor } from '@jsprismarine/blocks';
import type { Definition as ContentDefinition } from '@jsprismarine/content';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import type { Definitions } from '@jsprismarine/packs';

import { definitionOf, definitionsOf } from './ContentOptions';
import type { ContentOptions } from './ContentOptions';

/** The two blocks the fixture declares, which are also the whole of its palette. */
export const FIXTURE_BLOCKS = ['minecraft:stone', 'minecraft:redstone_lamp'] as const;

/** The items the fixture resolves, taken from Java's committed item table. */
export const FIXTURE_ITEMS = ['minecraft:stone', 'minecraft:redstone_lamp', 'minecraft:diamond_pickaxe'] as const;

/** A palette of the two fixture blocks: `minecraft:redstone_lamp` carries one state, `lit`. */
export const fixtureBlockPalette = (): BlockPalette =>
    new BlockPalette([
        ['minecraft:stone', new BlockStateModel([])],
        [
            'minecraft:redstone_lamp',
            new BlockStateModel([{ name: 'lit', type: 'bool', values: [false, true], defaultValue: false }])
        ]
    ]);

/** One block file in the shape the `jsprismarine_vanilla` overlay writes. */
const blockFile = (identifier: string, hardness: number, lightEmission: number): unknown => ({
    format_version: '1.26.20',
    'minecraft:block': {
        description: { identifier },
        components: {
            'minecraft:destructible_by_mining': { seconds_to_destroy: hardness },
            'minecraft:destructible_by_explosion': { explosion_resistance: hardness * 5 },
            'minecraft:light_emission': lightEmission,
            'minecraft:light_dampening': 15,
            'minecraft:friction': 0.6,
            'jsprismarine:behavior': behaviorFor(identifier),
            'jsprismarine:block_properties': {
                friction: 0.6,
                random_tick: false,
                requires_correct_tool: true,
                push_reaction: 'push_pull',
                source: 'java'
            }
        }
    }
});

/** The definitions the fixture stack composes to. */
export const fixtureDefinitions = (): Definitions =>
    definitionsOf({
        blocks: new Map([
            ['minecraft:stone', definitionOf('blocks', 'minecraft:stone', blockFile('minecraft:stone', 1.5, 0))],
            [
                'minecraft:redstone_lamp',
                definitionOf('blocks', 'minecraft:redstone_lamp', blockFile('minecraft:redstone_lamp', 0.3, 15))
            ]
        ]),
        entities: new Map([
            [
                'minecraft:cow',
                definitionOf('entities', 'minecraft:cow', {
                    format_version: '1.21.0',
                    'minecraft:entity': {
                        description: { identifier: 'minecraft:cow', is_spawnable: true, is_summonable: true },
                        // The box is vanilla's. Declared because the server reads every hitbox
                        // off the content now, so a fixture without one makes a cow a cube.
                        components: {
                            'minecraft:health': { value: 10, max: 10 },
                            'minecraft:collision_box': { width: 0.9, height: 1.3 }
                        }
                    }
                })
            ]
        ]),
        spawnRules: new Map([
            [
                'minecraft:cow',
                definitionOf('spawnRules', 'minecraft:cow', {
                    format_version: '1.8.0',
                    'minecraft:spawn_rules': {
                        description: { identifier: 'minecraft:cow', population_control: 'animal' },
                        conditions: []
                    }
                })
            ]
        ]),
        tradeTables: new Map([
            [
                'trading/economy_trades/farmer_trades.json',
                definitionOf('tradeTables', 'trading/economy_trades/farmer_trades.json', {
                    tiers: [
                        {
                            total_exp_required: 0,
                            groups: [
                                {
                                    num_to_select: 1,
                                    trades: [
                                        {
                                            wants: [{ item: 'minecraft:paper', quantity: 24 }],
                                            gives: [{ item: 'minecraft:emerald', quantity: 1 }]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                })
            ]
        ]),
        biomes: new Map([
            [
                'minecraft:plains',
                definitionOf('biomes', 'minecraft:plains', {
                    format_version: '1.13.0',
                    'minecraft:biome': { description: { identifier: 'minecraft:plains' }, components: {} }
                })
            ]
        ]),
        features: new Map([
            [
                'minecraft:single_stone_feature',
                definitionOf('features', 'minecraft:single_stone_feature', {
                    format_version: '1.13.0',
                    'minecraft:single_block_feature': {
                        description: { identifier: 'minecraft:single_stone_feature' },
                        places_block: 'minecraft:stone',
                        enforce_placement_rules: true,
                        enforce_survivability_rules: true
                    }
                })
            ]
        ]),
        lootTablesJava: new Map([
            [
                'minecraft:blocks/stone',
                definitionOf('lootTablesJava', 'minecraft:blocks/stone', {
                    type: 'minecraft:block',
                    pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:cobblestone' }] }]
                })
            ]
        ]),
        recipesJava: new Map([
            [
                'minecraft:torch',
                definitionOf('recipesJava', 'minecraft:torch', {
                    type: 'minecraft:crafting_shapeless',
                    ingredients: ['minecraft:coal'],
                    result: { id: 'minecraft:torch' }
                })
            ]
        ]),
        advancements: new Map([
            [
                'minecraft:story/root',
                definitionOf('advancements', 'minecraft:story/root', {
                    criteria: { tick: { trigger: 'minecraft:tick' } }
                })
            ]
        ]),
        enchantments: new Map([
            [
                'minecraft:fortune',
                definitionOf('enchantments', 'minecraft:fortune', {
                    anvil_cost: 4,
                    description: { translate: 'enchantment.minecraft.fortune' },
                    max_cost: { base: 65, per_level_above_first: 9 },
                    max_level: 3,
                    min_cost: { base: 15, per_level_above_first: 9 },
                    slots: ['mainhand'],
                    supported_items: '#minecraft:enchantable/mining_loot',
                    weight: 2
                })
            ]
        ]),
        tags: new Map([
            [
                'block/minecraft:mineable/pickaxe',
                definitionOf('tags', 'block/minecraft:mineable/pickaxe', {
                    values: ['minecraft:stone', 'minecraft:redstone_lamp']
                })
            ],
            [
                'item/minecraft:enchantable/mining_loot',
                definitionOf('tags', 'item/minecraft:enchantable/mining_loot', {
                    values: ['minecraft:diamond_pickaxe']
                })
            ],
            // The `enchantment` registry is tagged as well as the `item` one,
            // and the two are not interchangeable: `in_enchanting_table` names
            // enchantments and `enchantable/mining_loot` names items.
            [
                'enchantment/minecraft:in_enchanting_table',
                definitionOf('tags', 'enchantment/minecraft:in_enchanting_table', {
                    values: ['minecraft:fortune']
                })
            ]
        ])
    });

/** The three item rows the fixture resolves, taken from Java's committed table. */
export const fixtureItemDefinitions = (): readonly ContentDefinition[] => {
    const wanted = new Set<string>(FIXTURE_ITEMS);
    return vanillaItemDefinitions().filter((definition) => wanted.has(definition.identifier));
};

/**
 * Options that build the fixture content without reading a file.
 *
 * @param overrides - Merged over the fixture, so a test changes one source
 *   and keeps the rest.
 */
export const fixtureContentOptions = (overrides: ContentOptions = {}): ContentOptions => ({
    load: () => ({ definitions: fixtureDefinitions(), diagnostics: [] }),
    blockPalette: fixtureBlockPalette(),
    itemDefinitions: fixtureItemDefinitions(),
    ...overrides
});
