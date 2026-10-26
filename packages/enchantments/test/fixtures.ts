import { expect } from 'vitest';

import { parseEnchantment } from '../src/definition';
import type { EnchantmentDefinition } from '../src/definition';
import { EnchantmentRegistry } from '../src/registry';

/**
 * Twelve of the 43 Java 26.3 enchantment files, copied verbatim out of
 * `data/minecraft/enchantment/`, together with the enchantment tags that
 * decide where they show up. The gated corpus test covers all 43; these are
 * the ones the behavior tests need, and they stay here so the suite runs with
 * no cached server jar.
 */
export const VANILLA_ENCHANTMENTS: Readonly<Record<string, unknown>> = {
    'minecraft:sharpness': {
        anvil_cost: 1,
        description: {
            translate: 'enchantment.minecraft.sharpness'
        },
        effects: {
            'minecraft:damage': [
                {
                    effect: {
                        type: 'minecraft:add',
                        value: {
                            type: 'minecraft:linear',
                            base: 1,
                            per_level_above_first: 0.5
                        }
                    }
                }
            ]
        },
        exclusive_set: '#minecraft:exclusive_set/damage',
        max_cost: {
            base: 21,
            per_level_above_first: 11
        },
        max_level: 5,
        min_cost: {
            base: 1,
            per_level_above_first: 11
        },
        primary_items: '#minecraft:enchantable/melee_weapon',
        slots: ['mainhand'],
        supported_items: '#minecraft:enchantable/sharp_weapon',
        weight: 10
    },
    'minecraft:smite': {
        anvil_cost: 2,
        description: {
            translate: 'enchantment.minecraft.smite'
        },
        effects: {
            'minecraft:damage': [
                {
                    effect: {
                        type: 'minecraft:add',
                        value: {
                            type: 'minecraft:linear',
                            base: 2.5,
                            per_level_above_first: 2.5
                        }
                    },
                    requirements: {
                        type: 'minecraft:entity_properties',
                        entity: 'this',
                        predicate: {
                            'minecraft:entity_type': '#minecraft:sensitive_to_smite'
                        }
                    }
                }
            ]
        },
        exclusive_set: '#minecraft:exclusive_set/damage',
        max_cost: {
            base: 25,
            per_level_above_first: 8
        },
        max_level: 5,
        min_cost: {
            base: 5,
            per_level_above_first: 8
        },
        primary_items: '#minecraft:enchantable/melee_weapon',
        slots: ['mainhand'],
        supported_items: '#minecraft:enchantable/weapon',
        weight: 5
    },
    'minecraft:fortune': {
        anvil_cost: 4,
        description: {
            translate: 'enchantment.minecraft.fortune'
        },
        exclusive_set: '#minecraft:exclusive_set/mining',
        max_cost: {
            base: 65,
            per_level_above_first: 9
        },
        max_level: 3,
        min_cost: {
            base: 15,
            per_level_above_first: 9
        },
        slots: ['mainhand'],
        supported_items: '#minecraft:enchantable/mining_loot',
        weight: 2
    },
    'minecraft:silk_touch': {
        anvil_cost: 8,
        description: {
            translate: 'enchantment.minecraft.silk_touch'
        },
        effects: {
            'minecraft:block_experience': [
                {
                    effect: {
                        type: 'minecraft:set',
                        value: 0
                    }
                }
            ]
        },
        exclusive_set: '#minecraft:exclusive_set/mining',
        max_cost: {
            base: 65,
            per_level_above_first: 0
        },
        max_level: 1,
        min_cost: {
            base: 15,
            per_level_above_first: 0
        },
        slots: ['mainhand'],
        supported_items: '#minecraft:enchantable/mining_loot',
        weight: 1
    },
    'minecraft:unbreaking': {
        anvil_cost: 2,
        description: {
            translate: 'enchantment.minecraft.unbreaking'
        },
        effects: {
            'minecraft:item_damage': [
                {
                    effect: {
                        type: 'minecraft:remove_binomial',
                        chance: {
                            type: 'minecraft:fraction',
                            denominator: {
                                type: 'minecraft:linear',
                                base: 10,
                                per_level_above_first: 5
                            },
                            numerator: {
                                type: 'minecraft:linear',
                                base: 2,
                                per_level_above_first: 2
                            }
                        }
                    },
                    requirements: {
                        type: 'minecraft:match_tool',
                        predicate: {
                            items: '#minecraft:enchantable/armor'
                        }
                    }
                },
                {
                    effect: {
                        type: 'minecraft:remove_binomial',
                        chance: {
                            type: 'minecraft:fraction',
                            denominator: {
                                type: 'minecraft:linear',
                                base: 2,
                                per_level_above_first: 1
                            },
                            numerator: {
                                type: 'minecraft:linear',
                                base: 1,
                                per_level_above_first: 1
                            }
                        }
                    },
                    requirements: {
                        type: 'minecraft:inverted',
                        term: {
                            type: 'minecraft:match_tool',
                            predicate: {
                                items: '#minecraft:enchantable/armor'
                            }
                        }
                    }
                }
            ]
        },
        max_cost: {
            base: 55,
            per_level_above_first: 8
        },
        max_level: 3,
        min_cost: {
            base: 5,
            per_level_above_first: 8
        },
        slots: ['any'],
        supported_items: '#minecraft:enchantable/durability',
        weight: 5
    },
    'minecraft:mending': {
        anvil_cost: 4,
        description: {
            translate: 'enchantment.minecraft.mending'
        },
        effects: {
            'minecraft:repair_with_xp': [
                {
                    effect: {
                        type: 'minecraft:multiply',
                        factor: 2
                    }
                }
            ]
        },
        max_cost: {
            base: 75,
            per_level_above_first: 25
        },
        max_level: 1,
        min_cost: {
            base: 25,
            per_level_above_first: 25
        },
        slots: ['any'],
        supported_items: '#minecraft:enchantable/durability',
        weight: 2
    },
    'minecraft:infinity': {
        anvil_cost: 8,
        description: {
            translate: 'enchantment.minecraft.infinity'
        },
        effects: {
            'minecraft:ammo_use': [
                {
                    effect: {
                        type: 'minecraft:set',
                        value: 0
                    },
                    requirements: {
                        type: 'minecraft:match_tool',
                        predicate: {
                            items: 'minecraft:arrow'
                        }
                    }
                }
            ]
        },
        exclusive_set: '#minecraft:exclusive_set/bow',
        max_cost: {
            base: 50,
            per_level_above_first: 0
        },
        max_level: 1,
        min_cost: {
            base: 20,
            per_level_above_first: 0
        },
        slots: ['mainhand'],
        supported_items: '#minecraft:enchantable/bow',
        weight: 1
    },
    'minecraft:protection': {
        anvil_cost: 1,
        description: {
            translate: 'enchantment.minecraft.protection'
        },
        effects: {
            'minecraft:damage_protection': [
                {
                    effect: {
                        type: 'minecraft:add',
                        value: {
                            type: 'minecraft:linear',
                            base: 1,
                            per_level_above_first: 1
                        }
                    },
                    requirements: {
                        type: 'minecraft:damage_source_properties',
                        predicate: {
                            tags: [
                                {
                                    expected: false,
                                    id: '#minecraft:bypasses_invulnerability'
                                }
                            ]
                        }
                    }
                }
            ]
        },
        exclusive_set: '#minecraft:exclusive_set/armor',
        max_cost: {
            base: 12,
            per_level_above_first: 11
        },
        max_level: 4,
        min_cost: {
            base: 1,
            per_level_above_first: 11
        },
        slots: ['armor'],
        supported_items: '#minecraft:enchantable/armor',
        weight: 10
    },
    'minecraft:efficiency': {
        anvil_cost: 1,
        description: {
            translate: 'enchantment.minecraft.efficiency'
        },
        effects: {
            'minecraft:attributes': [
                {
                    amount: {
                        type: 'minecraft:levels_squared',
                        added: 1
                    },
                    attribute: 'minecraft:mining_efficiency',
                    id: 'minecraft:enchantment.efficiency',
                    operation: 'add_value'
                }
            ]
        },
        max_cost: {
            base: 51,
            per_level_above_first: 10
        },
        max_level: 5,
        min_cost: {
            base: 1,
            per_level_above_first: 10
        },
        slots: ['mainhand'],
        supported_items: '#minecraft:enchantable/mining',
        weight: 10
    },
    'minecraft:binding_curse': {
        anvil_cost: 8,
        description: {
            translate: 'enchantment.minecraft.binding_curse'
        },
        effects: {
            'minecraft:prevent_armor_change': {}
        },
        max_cost: {
            base: 50,
            per_level_above_first: 0
        },
        max_level: 1,
        min_cost: {
            base: 25,
            per_level_above_first: 0
        },
        slots: ['armor'],
        supported_items: '#minecraft:enchantable/equippable',
        weight: 1
    },
    'minecraft:looting': {
        anvil_cost: 4,
        description: {
            translate: 'enchantment.minecraft.looting'
        },
        effects: {
            'minecraft:equipment_drops': [
                {
                    effect: {
                        type: 'minecraft:add',
                        value: {
                            type: 'minecraft:linear',
                            base: 0.01,
                            per_level_above_first: 0.01
                        }
                    },
                    enchanted: 'attacker',
                    requirements: {
                        type: 'minecraft:entity_properties',
                        entity: 'attacker',
                        predicate: {
                            'minecraft:entity_type': 'minecraft:player'
                        }
                    }
                }
            ]
        },
        max_cost: {
            base: 65,
            per_level_above_first: 9
        },
        max_level: 3,
        min_cost: {
            base: 15,
            per_level_above_first: 9
        },
        slots: ['mainhand'],
        supported_items: '#minecraft:enchantable/melee_weapon',
        weight: 2
    },
    'minecraft:thorns': {
        anvil_cost: 8,
        description: {
            translate: 'enchantment.minecraft.thorns'
        },
        effects: {
            'minecraft:post_attack': [
                {
                    affected: 'attacker',
                    effect: {
                        type: 'minecraft:all_of',
                        effects: [
                            {
                                type: 'minecraft:damage_entity',
                                damage_type: 'minecraft:thorns',
                                max_damage: 5,
                                min_damage: 1
                            },
                            {
                                type: 'minecraft:change_item_damage',
                                amount: 2
                            }
                        ]
                    },
                    enchanted: 'victim',
                    requirements: {
                        type: 'minecraft:random_chance',
                        chance: {
                            type: 'minecraft:enchantment_level',
                            amount: {
                                type: 'minecraft:linear',
                                base: 0.15,
                                per_level_above_first: 0.15
                            }
                        }
                    }
                }
            ]
        },
        max_cost: {
            base: 60,
            per_level_above_first: 20
        },
        max_level: 3,
        min_cost: {
            base: 10,
            per_level_above_first: 20
        },
        primary_items: '#minecraft:enchantable/chest_armor',
        slots: ['any'],
        supported_items: '#minecraft:enchantable/armor',
        weight: 1
    }
};

/** The enchantment tags of 26.3 that the behavior tests read, values verbatim. */
export const VANILLA_ENCHANTMENT_TAGS: ReadonlyMap<string, readonly string[]> = new Map(
    Object.entries({
        'minecraft:curse': ['minecraft:binding_curse', 'minecraft:vanishing_curse'],
        'minecraft:treasure': [
            'minecraft:binding_curse',
            'minecraft:vanishing_curse',
            'minecraft:swift_sneak',
            'minecraft:soul_speed',
            'minecraft:frost_walker',
            'minecraft:mending',
            'minecraft:wind_burst'
        ],
        'minecraft:non_treasure': [
            'minecraft:protection',
            'minecraft:fire_protection',
            'minecraft:feather_falling',
            'minecraft:blast_protection',
            'minecraft:projectile_protection',
            'minecraft:respiration',
            'minecraft:aqua_affinity',
            'minecraft:thorns',
            'minecraft:depth_strider',
            'minecraft:sharpness',
            'minecraft:smite',
            'minecraft:bane_of_arthropods',
            'minecraft:knockback',
            'minecraft:fire_aspect',
            'minecraft:looting',
            'minecraft:sweeping_edge',
            'minecraft:efficiency',
            'minecraft:silk_touch',
            'minecraft:unbreaking',
            'minecraft:fortune',
            'minecraft:power',
            'minecraft:punch',
            'minecraft:flame',
            'minecraft:infinity',
            'minecraft:luck_of_the_sea',
            'minecraft:lure',
            'minecraft:loyalty',
            'minecraft:impaling',
            'minecraft:riptide',
            'minecraft:channeling',
            'minecraft:multishot',
            'minecraft:quick_charge',
            'minecraft:piercing',
            'minecraft:density',
            'minecraft:breach',
            'minecraft:lunge'
        ],
        'minecraft:in_enchanting_table': ['#minecraft:non_treasure'],
        'minecraft:double_trade_price': ['#minecraft:treasure'],
        'minecraft:tradeable': [
            '#minecraft:non_treasure',
            'minecraft:binding_curse',
            'minecraft:vanishing_curse',
            'minecraft:frost_walker',
            'minecraft:mending'
        ],
        'minecraft:exclusive_set/armor': [
            'minecraft:protection',
            'minecraft:blast_protection',
            'minecraft:fire_protection',
            'minecraft:projectile_protection'
        ],
        'minecraft:exclusive_set/boots': ['minecraft:frost_walker', 'minecraft:depth_strider'],
        'minecraft:exclusive_set/bow': ['minecraft:infinity', 'minecraft:mending'],
        'minecraft:exclusive_set/crossbow': ['minecraft:multishot', 'minecraft:piercing'],
        'minecraft:exclusive_set/damage': [
            'minecraft:sharpness',
            'minecraft:smite',
            'minecraft:bane_of_arthropods',
            'minecraft:impaling',
            'minecraft:density',
            'minecraft:breach'
        ],
        'minecraft:exclusive_set/mining': ['minecraft:fortune', 'minecraft:silk_touch'],
        'minecraft:exclusive_set/riptide': ['minecraft:loyalty', 'minecraft:channeling']
    })
);

/** Parses every fixture, failing the suite if any of them reports. */
export const vanillaDefinitions = (): readonly EnchantmentDefinition[] =>
    Object.entries(VANILLA_ENCHANTMENTS).map(([id, body]) => {
        const { value, diagnostics } = parseEnchantment(id, body);
        expect(diagnostics, id).toEqual([]);
        return value;
    });

/** A registry over the fixtures, with the item tags the fixtures reference. */
export const vanillaRegistry = (itemTags: Readonly<Record<string, readonly string[]>> = {}): EnchantmentRegistry =>
    new EnchantmentRegistry({
        definitions: vanillaDefinitions(),
        tags: VANILLA_ENCHANTMENT_TAGS,
        items: { tagsOf: (itemId) => itemTags[itemId] ?? [] }
    });
