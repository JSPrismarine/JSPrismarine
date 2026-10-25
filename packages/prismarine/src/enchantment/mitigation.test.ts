import { describe, expect, it } from 'vitest';

import { buildServerContent } from '../content/ServerContent';
import { definitionOf, definitionsOf } from '../content/ContentOptions';
import type { ServerContent } from '../content/ServerContent';
import { fixtureBlockPalette, fixtureItemDefinitions } from '../content/testing';
import { DamageCause } from '../entity/DamageCause';
import { Item } from '../item/Item';
import { protectionReduced } from '../entity/Damage';
import { enchantmentProtection } from './mitigation';

/**
 * The Protection family, read out of the enchantment files rather than off a
 * constant.
 *
 * Four of the five only answer one kind of damage, and they say which one in
 * their own `requirements` as a `damage_source_properties` condition over the
 * damage type tags. That is the whole reason this cannot be a table of levels:
 * Fire Protection asking `#minecraft:is_fire` is a question only the data and
 * the tags together can answer.
 *
 * The enchantment bodies below are copied verbatim from Java 26.3's
 * `data/minecraft/enchantment/`, and the tag bodies from
 * `data/minecraft/tags/damage_type/`, so the test does not need the cached jar.
 */

const linear = (base: number, perLevel: number) => ({
    type: 'minecraft:linear',
    base,
    per_level_above_first: perLevel
});

const protectionEffect = (base: number, perLevel: number, tags: Array<{ expected: boolean; id: string }>) => [
    {
        effect: { type: 'minecraft:add', value: linear(base, perLevel) },
        requirements: { type: 'minecraft:damage_source_properties', predicate: { tags } }
    }
];

const NOT_BYPASSING = { expected: false, id: '#minecraft:bypasses_invulnerability' };

const ARMOR = {
    anvil_cost: 1,
    description: { translate: 'enchantment' },
    max_cost: { base: 12, per_level_above_first: 11 },
    min_cost: { base: 1, per_level_above_first: 11 },
    slots: ['armor'],
    supported_items: '#minecraft:enchantable/armor',
    weight: 10
};

const enchantmentDefinitions = () =>
    new Map([
        [
            'minecraft:protection',
            definitionOf('enchantments', 'minecraft:protection', {
                ...ARMOR,
                max_level: 4,
                effects: { 'minecraft:damage_protection': protectionEffect(1, 1, [NOT_BYPASSING]) }
            })
        ],
        [
            'minecraft:fire_protection',
            definitionOf('enchantments', 'minecraft:fire_protection', {
                ...ARMOR,
                max_level: 4,
                effects: {
                    'minecraft:damage_protection': protectionEffect(2, 2, [
                        { expected: true, id: '#minecraft:is_fire' },
                        NOT_BYPASSING
                    ])
                }
            })
        ],
        [
            'minecraft:feather_falling',
            definitionOf('enchantments', 'minecraft:feather_falling', {
                ...ARMOR,
                max_level: 4,
                effects: {
                    'minecraft:damage_protection': protectionEffect(3, 3, [
                        { expected: true, id: '#minecraft:is_fall' },
                        NOT_BYPASSING
                    ])
                }
            })
        ]
    ]);

const damageTypeTags = () =>
    new Map([
        [
            'damage_type/minecraft:is_fire',
            definitionOf('tags', 'damage_type/minecraft:is_fire', {
                values: ['minecraft:in_fire', 'minecraft:on_fire', 'minecraft:lava']
            })
        ],
        [
            'damage_type/minecraft:is_fall',
            definitionOf('tags', 'damage_type/minecraft:is_fall', { values: ['minecraft:fall'] })
        ],
        [
            'damage_type/minecraft:bypasses_invulnerability',
            definitionOf('tags', 'damage_type/minecraft:bypasses_invulnerability', {
                values: ['minecraft:out_of_world', 'minecraft:generic_kill']
            })
        ],
        [
            'item/minecraft:enchantable/armor',
            definitionOf('tags', 'item/minecraft:enchantable/armor', {
                values: ['minecraft:diamond_chestplate', 'minecraft:diamond_boots']
            })
        ]
    ]);

const content = (): ServerContent =>
    buildServerContent({
        load: () => ({
            definitions: definitionsOf({ enchantments: enchantmentDefinitions(), tags: damageTypeTags() }),
            diagnostics: []
        }),
        blockPalette: fixtureBlockPalette(),
        itemDefinitions: fixtureItemDefinitions()
    });

/** A victim standing at the origin, wearing whatever is handed to it. */
const victim = {
    getType: () => 'minecraft:player',
    getPosition: () => ({ getX: () => 0, getY: () => 64, getZ: () => 0 })
};

/** A blow with nobody behind it, which is what fire, falling and starving are. */
const environmental = (cause: DamageCause) => ({ cause, attacker: null, projectile: null });

const chestplate = (levels: Record<string, number>) =>
    new Item({ name: 'minecraft:diamond_chestplate', enchantments: levels });

const boots = (levels: Record<string, number>) => new Item({ name: 'minecraft:diamond_boots', enchantments: levels });

describe('enchantmentProtection', () => {
    it('is zero for a server with no pack stack, rather than a guessed curve', () => {
        expect(
            enchantmentProtection({
                content: undefined,
                victim,
                equipment: { chest: chestplate({ 'minecraft:protection': 4 }) },
                source: environmental(DamageCause.Generic)
            })
        ).toBe(0);
    });

    it('is zero for armor carrying no enchantment', () => {
        expect(
            enchantmentProtection({
                content: content(),
                victim,
                equipment: { chest: new Item({ name: 'minecraft:diamond_chestplate' }) },
                source: environmental(DamageCause.Generic)
            })
        ).toBe(0);
    });

    it('is one point per level of Protection, which is what the file says', () => {
        expect(
            enchantmentProtection({
                content: content(),
                victim,
                equipment: { chest: chestplate({ 'minecraft:protection': 4 }) },
                source: environmental(DamageCause.Generic)
            })
        ).toBe(4);
    });

    it('counts each worn piece separately rather than merging them into one', () => {
        const built = content();
        const worn = {
            chest: chestplate({ 'minecraft:protection': 4 }),
            feet: boots({ 'minecraft:protection': 4 })
        };

        expect(
            enchantmentProtection({
                content: built,
                victim,
                equipment: worn,
                source: environmental(DamageCause.Generic)
            })
        ).toBe(8);
    });

    it('leaves the void alone, because every Protection file refuses a source that bypasses invulnerability', () => {
        expect(
            enchantmentProtection({
                content: content(),
                victim,
                equipment: { chest: chestplate({ 'minecraft:protection': 4 }) },
                source: environmental(DamageCause.Void)
            })
        ).toBe(0);
    });

    describe('the four that answer one kind of damage', () => {
        it('counts Fire Protection against fire and not against anything else', () => {
            const built = content();
            const worn = { chest: chestplate({ 'minecraft:fire_protection': 2 }) };

            expect(
                enchantmentProtection({
                    content: built,
                    victim,
                    equipment: worn,
                    source: environmental(DamageCause.Fire)
                })
            ).toBe(4);
            expect(
                enchantmentProtection({
                    content: built,
                    victim,
                    equipment: worn,
                    source: environmental(DamageCause.Attack)
                })
            ).toBe(0);
        });

        it('counts Feather Falling against a fall and not against fire', () => {
            const built = content();
            const worn = { feet: boots({ 'minecraft:feather_falling': 4 }) };

            expect(
                enchantmentProtection({
                    content: built,
                    victim,
                    equipment: worn,
                    source: environmental(DamageCause.Fall)
                })
            ).toBe(12);
            expect(
                enchantmentProtection({
                    content: built,
                    victim,
                    equipment: worn,
                    source: environmental(DamageCause.Fire)
                })
            ).toBe(0);
        });

        it('adds the general and the specific when both apply', () => {
            expect(
                enchantmentProtection({
                    content: content(),
                    victim,
                    equipment: {
                        chest: chestplate({ 'minecraft:protection': 4 }),
                        feet: boots({ 'minecraft:feather_falling': 4 })
                    },
                    source: environmental(DamageCause.Fall)
                })
            ).toBe(16);
        });
    });

    it('reaches the damage formula as a measurable reduction', () => {
        const factor = enchantmentProtection({
            content: content(),
            victim,
            equipment: {
                chest: chestplate({ 'minecraft:protection': 4 }),
                feet: boots({ 'minecraft:protection': 4 })
            },
            source: environmental(DamageCause.Generic)
        });

        // Eight points against the divisor of 25, so a ten point blow lands as 6.8.
        expect(protectionReduced(10, factor)).toBeCloseTo(6.8);
        expect(protectionReduced(10, 0)).toBe(10);
    });
});
