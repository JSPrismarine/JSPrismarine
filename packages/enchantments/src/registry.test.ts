import { constantRandom, scriptedRandom } from '@jsprismarine/predicates';
import type { DamageSource, EntityView, ItemStack, LootContextParameters } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';
import { reportProgress } from '../../../.test/reportProgress';

import { vanillaRegistry } from '../test/fixtures';
import { ENCHANTMENT_TAGS, EnchantmentRegistry } from './registry';
import type { EffectRun } from './registry';

/** Item tags the fixture enchantments name, with one item in each that the tests use. */
const ITEM_TAGS: Readonly<Record<string, readonly string[]>> = {
    'minecraft:diamond_sword': [
        'minecraft:enchantable/sharp_weapon',
        'minecraft:enchantable/melee_weapon',
        'minecraft:enchantable/weapon',
        'minecraft:enchantable/durability',
        'minecraft:enchantable/fire_aspect'
    ],
    'minecraft:diamond_pickaxe': [
        'minecraft:enchantable/mining',
        'minecraft:enchantable/mining_loot',
        'minecraft:enchantable/durability'
    ],
    'minecraft:diamond_chestplate': [
        'minecraft:enchantable/armor',
        'minecraft:enchantable/chest_armor',
        'minecraft:enchantable/durability'
    ],
    'minecraft:stick': []
};

const stack = (id: string, components: Readonly<Record<string, unknown>> = {}): ItemStack => ({
    id,
    count: 1,
    components: new Map(Object.entries(components))
});

const registry = () => vanillaRegistry(ITEM_TAGS);

const entity = (type: string, typeTags: readonly string[] = []): EntityView => ({ type, typeTags });

const sword: DamageSource = { type: 'minecraft:player_attack', tags: [] };

/** The `enchanted_damage` key set, with the victim and the attacker a test names. */
const damageParameters = (victim: EntityView, attacker?: EntityView): LootContextParameters => ({
    this_entity: victim,
    origin: { x: 0, y: 64, z: 0 },
    damage_source: sword,
    ...(attacker === undefined ? {} : { attacking_entity: attacker })
});

describe('the enchantment tags', () => {
    it('expands a tag that names another tag', () => {
        // in_enchanting_table.json holds exactly ["#minecraft:non_treasure"].
        const members = registry().membersOf('minecraft:in_enchanting_table');

        expect(members.has('minecraft:sharpness')).toBe(true);
        expect(members.has('minecraft:mending')).toBe(false);
    });

    it('answers membership for an enchantment', () => {
        const found = registry();

        expect(found.hasTag('minecraft:binding_curse', 'minecraft:curse')).toBe(true);
        expect(found.hasTag('minecraft:mending', 'minecraft:treasure')).toBe(true);
        expect(found.hasTag('minecraft:sharpness', 'minecraft:treasure')).toBe(false);
        reportProgress(`${ENCHANTMENT_TAGS.length} enchantment functionality tags are registered.`);
    });

    it('stops at a tag cycle instead of recursing', () => {
        const cyclic = new EnchantmentRegistry({
            definitions: [],
            tags: new Map([
                ['minecraft:a', ['#minecraft:b', 'minecraft:sharpness']],
                ['minecraft:b', ['#minecraft:a', 'minecraft:smite']]
            ])
        });

        expect([...cyclic.membersOf('minecraft:a')].toSorted()).toEqual(['minecraft:sharpness', 'minecraft:smite']);
    });
});

describe('exclusive sets', () => {
    it('rejects two members of one exclusive set', () => {
        // exclusive_set/damage.json holds sharpness, smite and four others.
        const found = registry();

        expect(found.areCompatible('minecraft:sharpness', 'minecraft:smite')).toBe(false);
        expect(found.areCompatible('minecraft:smite', 'minecraft:sharpness')).toBe(false);
    });

    it('rejects fortune against silk touch', () => {
        expect(registry().areCompatible('minecraft:fortune', 'minecraft:silk_touch')).toBe(false);
    });

    it('rejects mending against infinity', () => {
        expect(registry().areCompatible('minecraft:mending', 'minecraft:infinity')).toBe(false);
    });

    it('rejects an enchantment against itself', () => {
        expect(registry().areCompatible('minecraft:sharpness', 'minecraft:sharpness')).toBe(false);
    });

    it('accepts enchantments from different sets', () => {
        expect(registry().areCompatible('minecraft:sharpness', 'minecraft:unbreaking')).toBe(true);
        expect(registry().areCompatible('minecraft:looting', 'minecraft:sharpness')).toBe(true);
    });

    it('lists what one enchantment excludes without listing itself', () => {
        const excluded = registry().exclusiveWith('minecraft:sharpness');

        expect(excluded.has('minecraft:smite')).toBe(true);
        expect(excluded.has('minecraft:sharpness')).toBe(false);
    });
});

describe('item support', () => {
    it('supports an item that carries the enchantment tag', () => {
        const found = registry();

        expect(found.supports(stack('minecraft:diamond_sword'), 'minecraft:sharpness')).toBe(true);
        expect(found.supports(stack('minecraft:diamond_pickaxe'), 'minecraft:sharpness')).toBe(false);
        expect(found.supports(stack('minecraft:diamond_pickaxe'), 'minecraft:fortune')).toBe(true);
    });

    it('treats an enchantment with no primary items as primary for everything it supports', () => {
        // fortune.json has no primary_items.
        const found = registry();

        expect(found.isPrimary(stack('minecraft:diamond_pickaxe'), 'minecraft:fortune')).toBe(true);
        expect(found.isPrimary(stack('minecraft:diamond_sword'), 'minecraft:fortune')).toBe(false);
    });

    it('lists every enchantment an item supports', () => {
        const supported = registry().applicableTo(stack('minecraft:diamond_pickaxe'));

        expect(supported.toSorted()).toEqual([
            'minecraft:efficiency',
            'minecraft:fortune',
            'minecraft:mending',
            'minecraft:silk_touch',
            'minecraft:unbreaking'
        ]);
    });

    it('supports nothing for an item with no enchantable tags', () => {
        expect(registry().applicableTo(stack('minecraft:stick'))).toEqual([]);
    });
});

describe('value effect application', () => {
    it('adds the damage of sharpness at its level', () => {
        // sharpness.json: add linear 1.0 + 0.5 per level above first.
        const damage = registry().modifyValue('damage', 2, {
            enchantments: new Map([['minecraft:sharpness', 3]]),
            context: { parameters: damageParameters(entity('minecraft:zombie')) }
        });

        expect(damage).toBe(4);
    });

    it('leaves the value alone when no enchantment declares the component', () => {
        const damage = registry().modifyValue('damage', 2, {
            enchantments: new Map([['minecraft:unbreaking', 3]]),
            context: { parameters: damageParameters(entity('minecraft:zombie')) }
        });

        expect(damage).toBe(2);
    });

    it('composes two enchantments in the order the map iterates', () => {
        // Sharpness adds, mending's repair_with_xp multiplies; running both
        // over repair_with_xp shows only mending, so use damage twice instead.
        const found = registry();
        const parameters = damageParameters(entity('minecraft:zombie', ['minecraft:sensitive_to_smite']));

        const both = found.modifyValue('damage', 0, {
            enchantments: new Map([
                ['minecraft:sharpness', 1],
                ['minecraft:smite', 1]
            ]),
            context: { parameters }
        });

        // sharpness adds 1.0 and smite adds 2.5 at level 1.
        expect(both).toBe(3.5);
    });

    it('runs unbreaking as a binomial removal over the damage taken', () => {
        // unbreaking.json on a non-armor item: chance 1/2 at level 1.
        const damage = registry().modifyValue('item_damage', 4, {
            enchantments: new Map([['minecraft:unbreaking', 1]]),
            context: {
                parameters: { tool: stack('minecraft:diamond_sword') },
                random: scriptedRandom([0.1, 0.9, 0.2, 0.95])
            }
        });

        expect(damage).toBe(2);
    });

    it('honors a requirements condition that fails', () => {
        // looting.json applies only when the attacker is a player.
        const drops = registry().modifyValue('equipment_drops', 0, {
            enchantments: new Map([['minecraft:looting', 3]]),
            enchanted: 'attacker',
            context: {
                parameters: damageParameters(entity('minecraft:cow'), entity('minecraft:zombie'))
            }
        });

        expect(drops).toBe(0);
    });

    it('applies the same entry when the condition holds', () => {
        const drops = registry().modifyValue('equipment_drops', 0, {
            enchantments: new Map([['minecraft:looting', 3]]),
            enchanted: 'attacker',
            context: {
                parameters: damageParameters(entity('minecraft:cow'), entity('minecraft:player'))
            }
        });

        expect(drops).toBeCloseTo(0.03, 10);
    });

    it('skips an entry whose enchanted target is the other side', () => {
        const drops = registry().modifyValue('equipment_drops', 0, {
            enchantments: new Map([['minecraft:looting', 3]]),
            enchanted: 'victim',
            context: {
                parameters: damageParameters(entity('minecraft:cow'), entity('minecraft:player'))
            }
        });

        expect(drops).toBe(0);
    });

    it('reads an unconditional value effect with no entries to filter', () => {
        // quick_charge is not in the fixture set, so build the component directly.
        const direct = new EnchantmentRegistry({
            definitions: [
                {
                    id: 'example:fast',
                    description: undefined,
                    supportedItems: { ids: new Set(), tags: [] },
                    primaryItems: undefined,
                    weight: 1,
                    maxLevel: 3,
                    minCost: { base: 1, perLevelAboveFirst: 1 },
                    maxCost: { base: 10, perLevelAboveFirst: 1 },
                    anvilCost: 1,
                    slots: ['mainhand'],
                    exclusiveSet: { ids: new Set(), tags: [] },
                    effects: new Map([
                        [
                            'crossbow_charge_time',
                            {
                                kind: 'unconditional_value',
                                effect: (level, base) => base - 0.25 * level
                            }
                        ]
                    ])
                }
            ]
        });

        expect(direct.modifyValue('crossbow_charge_time', 1.25, { enchantments: new Map([['example:fast', 2]]) })).toBe(
            0.75
        );
    });
});

describe('entity and location effect application', () => {
    it('hands a thorns hit to the sink as two resolved effects', () => {
        const runs: EffectRun[] = [];
        registry().runEffects(
            'post_attack',
            {
                enchantments: new Map([['minecraft:thorns', 1]]),
                enchanted: 'victim',
                context: {
                    parameters: damageParameters(entity('minecraft:cow'), entity('minecraft:zombie')),
                    random: constantRandom(0)
                }
            },
            (run) => runs.push(run)
        );

        expect(runs.map((run) => run.effect.type)).toEqual(['damage_entity', 'change_item_damage']);
        expect(runs[0]).toMatchObject({ enchantment: 'minecraft:thorns', level: 1, affected: 'attacker' });
    });

    it('does not fire thorns when the chance draw misses', () => {
        const runs: EffectRun[] = [];
        registry().runEffects(
            'post_attack',
            {
                enchantments: new Map([['minecraft:thorns', 1]]),
                enchanted: 'victim',
                context: {
                    parameters: damageParameters(entity('minecraft:cow'), entity('minecraft:zombie')),
                    random: constantRandom(0.99)
                }
            },
            (run) => runs.push(run)
        );

        expect(runs).toEqual([]);
    });

    it('resolves the attributes component into attribute effects', () => {
        // efficiency.json: mining efficiency of level squared plus one.
        const runs: EffectRun[] = [];
        registry().runEffects('attributes', { enchantments: new Map([['minecraft:efficiency', 3]]) }, (run) =>
            runs.push(run)
        );

        expect(runs).toHaveLength(1);
        expect(runs[0]?.effect).toEqual({
            type: 'attribute',
            amount: 10,
            attribute: 'minecraft:mining_efficiency',
            id: 'minecraft:enchantment.efficiency',
            operation: 'add_value'
        });
    });
});

describe('marker components', () => {
    it('reports a plain marker from its presence alone', () => {
        // binding_curse.json declares prevent_armor_change with an empty body.
        expect(
            registry().markerApplies('prevent_armor_change', {
                enchantments: new Map([['minecraft:binding_curse', 1]])
            })
        ).toBe(true);
    });

    it('reports no marker when nothing declares it', () => {
        expect(
            registry().markerApplies('prevent_armor_change', {
                enchantments: new Map([['minecraft:sharpness', 1]])
            })
        ).toBe(false);
    });
});
