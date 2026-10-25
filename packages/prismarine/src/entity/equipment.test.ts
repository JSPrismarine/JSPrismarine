import { describe, expect, it } from 'vitest';

import { buildServerContent } from '../content/ServerContent';
import type { ServerContent } from '../content/ServerContent';
import { itemOfDrop } from '../inventory/persistence';
import { Item } from '../item/Item';
import {
    MOB_EQUIPMENT_SLOTS,
    mobEquipmentSlotOf,
    prunedEquipmentTables,
    rollMobEquipment,
    sameEquipment,
    sameEquipmentItems,
    slotForItem
} from './equipment';

/** An item that declares the slot it is worn in, which is all {@link slotForItem} reads. */
const wornIn = (slot: string | undefined) => ({ getEquipmentSlot: () => slot });

describe('entity equipment', () => {
    describe('mobEquipmentSlotOf', () => {
        it('reads the engine spelling a behavior pack uses for each slot', () => {
            expect(mobEquipmentSlotOf('slot.weapon.mainhand')).toBe('mainhand');
            expect(mobEquipmentSlotOf('slot.weapon.offhand')).toBe('offhand');
            expect(mobEquipmentSlotOf('slot.armor.head')).toBe('head');
            expect(mobEquipmentSlotOf('slot.armor.chest')).toBe('chest');
            expect(mobEquipmentSlotOf('slot.armor.legs')).toBe('legs');
            expect(mobEquipmentSlotOf('slot.armor.feet')).toBe('feet');
        });

        it('accepts the bare slot name, which is how an item component spells it', () => {
            for (const slot of MOB_EQUIPMENT_SLOTS) expect(mobEquipmentSlotOf(slot)).toBe(slot);
        });

        it('answers nothing for a slot no mob equipment packet carries', () => {
            // The pillager captain's banner names this one, and the body slot holds horse armor.
            expect(mobEquipmentSlotOf('slot.armor.saddle')).toBeUndefined();
            expect(mobEquipmentSlotOf('slot.armor.body')).toBeUndefined();
            expect(mobEquipmentSlotOf('slot.hotbar')).toBeUndefined();
        });
    });

    describe('slotForItem', () => {
        it('puts a worn item in the slot its own component names', () => {
            expect(slotForItem(wornIn('head'))).toBe('head');
            expect(slotForItem(wornIn('feet'))).toBe('feet');
        });

        it('puts an item with no equippable component in the main hand', () => {
            // A bow, a crossbow and the fox's emerald all arrive this way.
            expect(slotForItem(wornIn(undefined))).toBe('mainhand');
        });

        it('puts a category rather than a slot in the main hand', () => {
            // `any`, `hand`, `armor` and `saddle` are categories; none names a packet slot.
            expect(slotForItem(wornIn('any'))).toBe('mainhand');
            expect(slotForItem(wornIn('hand'))).toBe('mainhand');
            expect(slotForItem(wornIn('saddle'))).toBe('mainhand');
        });
    });

    describe('prunedEquipmentTables', () => {
        /** `skeleton_gear.json`'s two pools: the bow, and the armor set behind a chance gate. */
        const skeletonGear = {
            pools: [
                { rolls: 1, entries: [{ type: 'item', name: 'minecraft:bow' }] },
                {
                    conditions: [{ condition: 'random_difficulty_chance', default_chance: 1 }],
                    tiers: { initial_range: 3 },
                    entries: [{ type: 'loot_table', name: 'loot_tables/entities/armor_set_iron.json' }]
                }
            ]
        };

        it('keeps the pools the Java evaluator reads whole', () => {
            const pruned = prunedEquipmentTables(new Map([['gear', skeletonGear]]));

            expect(pruned.get('gear')).toEqual({
                pools: [{ rolls: 1, entries: [{ type: 'item', name: 'minecraft:bow' }] }]
            });
        });

        it('drops a pool whose conditions the evaluator would ignore', () => {
            // The whole point: `conditions` is the plural array this evaluator does not read, so
            // a pool carrying one would roll every time instead of at its stated chance. Handed
            // `zombie_equipment.json` whole it armed 2000 of 2000 zombies.
            const pruned = prunedEquipmentTables(
                new Map([
                    [
                        'zombie',
                        {
                            pools: [
                                {
                                    rolls: 1,
                                    conditions: [{ condition: 'random_regional_difficulty_chance', max_chance: 0.05 }],
                                    entries: [{ type: 'item', name: 'minecraft:iron_sword' }]
                                }
                            ]
                        }
                    ]
                ])
            );

            expect(pruned.get('zombie')).toEqual({ pools: [] });
        });

        it('unwraps the record the pack loader wraps each file in', () => {
            const pruned = prunedEquipmentTables(
                new Map([['gear', { pack: 'vanilla', path: 'loot_tables/x.json', data: skeletonGear }]])
            );

            expect(pruned.get('gear')).toEqual({
                pools: [{ rolls: 1, entries: [{ type: 'item', name: 'minecraft:bow' }] }]
            });
        });

        it('passes a table with no pools through untouched', () => {
            const pruned = prunedEquipmentTables(new Map([['empty', {}]]));

            expect(pruned.get('empty')).toEqual({});
        });
    });

    describe('sameEquipment', () => {
        it('calls two empty sets the same', () => {
            expect(sameEquipment({}, {})).toBe(true);
        });

        it('calls the same item in the same slot the same', () => {
            const bow = { mainhand: { identifier: 'minecraft:bow', count: 1 } };

            expect(sameEquipment(bow, { mainhand: { identifier: 'minecraft:bow', count: 1 } })).toBe(true);
        });

        it('tells an occupied slot from an empty one', () => {
            expect(sameEquipment({ mainhand: { identifier: 'minecraft:bow', count: 1 } }, {})).toBe(false);
        });

        it('tells the same item in a different slot apart', () => {
            const helmet = { identifier: 'minecraft:iron_helmet', count: 1 };

            expect(sameEquipment({ head: helmet }, { chest: helmet })).toBe(false);
        });

        it('reads the condition an item is in, not only which item it is', () => {
            const sword = { identifier: 'minecraft:iron_sword', count: 1 };

            expect(sameEquipment({ mainhand: sword }, { mainhand: { ...sword, damage: 3 } })).toBe(false);
            expect(sameEquipment({ mainhand: sword }, { mainhand: { ...sword, customName: 'Stabby' } })).toBe(false);
            expect(sameEquipment({ mainhand: sword }, { mainhand: { ...sword, lore: ['a'] } })).toBe(false);
        });

        it('reads enchantments whichever order their keys are in', () => {
            const sword = { identifier: 'minecraft:iron_sword', count: 1 };
            const left = {
                mainhand: { ...sword, enchantments: { 'minecraft:sharpness': 2, 'minecraft:knockback': 1 } }
            };
            const right = {
                mainhand: { ...sword, enchantments: { 'minecraft:knockback': 1, 'minecraft:sharpness': 2 } }
            };

            expect(sameEquipment(left, right)).toBe(true);
            expect(sameEquipment(left, { mainhand: { ...sword, enchantments: { 'minecraft:sharpness': 2 } } })).toBe(
                false
            );
        });

        it('treats an absent optional field as its default rather than as a difference', () => {
            // A drop rebuilt from a save carries explicit zeros where the rolled one carried
            // nothing, and calling that a change would broadcast every restored mob.
            const sword = { identifier: 'minecraft:iron_sword', count: 1 };

            expect(sameEquipment({ mainhand: sword }, { mainhand: { ...sword, damage: 0, meta: 0 } })).toBe(true);
        });
    });

    describe('sameEquipmentItems', () => {
        it('calls two empty sets the same', () => {
            expect(sameEquipmentItems({}, {})).toBe(true);
        });

        it('compares the bytes the packets would carry, so a rebuilt item matches', () => {
            const made = () => new Item({ name: 'minecraft:bow', count: 1 });

            expect(sameEquipmentItems({ mainhand: made() }, { mainhand: made() })).toBe(true);
        });

        it('tells an empty slot from one holding air, which encode differently', () => {
            expect(sameEquipmentItems({ mainhand: Item.air() }, {})).toBe(false);
        });

        it('tells two different items apart', () => {
            expect(
                sameEquipmentItems(
                    { mainhand: new Item({ name: 'minecraft:bow', count: 1 }) },
                    { mainhand: new Item({ name: 'minecraft:iron_sword', count: 1 }) }
                )
            ).toBe(false);
        });
    });
});

/**
 * What the real behavior pack's equipment tables roll.
 *
 * Reads the fetched Bedrock pack, so it skips without it:
 *
 * ```sh
 * JSP_CONTENT_VANILLA=1 pnpm --filter @jsprismarine/prismarine exec vitest run src/entity/equipment
 * ```
 */
describe.skipIf(!process.env.JSP_CONTENT_VANILLA)('the equipment the vanilla pack stack rolls', () => {
    /** Built once: the pack stack takes a minute and every test here reads the same build. */
    let built: ServerContent | undefined;
    const vanilla = (): ServerContent => (built ??= buildServerContent({}));

    /** What one table puts in each slot, over enough rolls to catch a gate that never fires. */
    const over = (table: string, rolls: number) => {
        const content = vanilla();
        const counts = new Map<string, number>();

        for (let roll = 0; roll < rolls; roll++) {
            const equipment = rollMobEquipment({
                content,
                table,
                itemOf: (drop) => itemOfDrop(drop, content)
            });

            for (const slot of MOB_EQUIPMENT_SLOTS) {
                const drop = equipment[slot];
                if (drop === undefined) continue;
                const key = `${slot}:${drop.identifier}`;
                counts.set(key, (counts.get(key) ?? 0) + 1);
            }
        }

        return counts;
    };

    it('arms each mob that vanilla always arms, in the main hand', () => {
        // The weapon pools are plain Java grammar and fire unconditionally in vanilla too, so
        // every roll produces one. This is the census the whole change exists for: before it,
        // every one of these was empty.
        const weapons: readonly (readonly [string, string])[] = [
            ['loot_tables/entities/skeleton_gear.json', 'minecraft:bow'],
            ['loot_tables/entities/pillager_gear.json', 'minecraft:crossbow'],
            ['loot_tables/entities/vindicator_gear.json', 'minecraft:iron_axe'],
            ['loot_tables/entities/wither_skeleton_gear.json', 'minecraft:stone_sword'],
            ['loot_tables/entities/piglin_brute_gear.json', 'minecraft:golden_axe'],
            ['loot_tables/entities/vex_gear.json', 'minecraft:iron_sword']
        ];

        for (const [table, weapon] of weapons) {
            expect(over(table, 50).get(`mainhand:${weapon}`), table).toBe(50);
        }
    }, 180_000);

    it('rolls nothing from the pools whose chance gate this evaluator cannot read', () => {
        // The conservative half of the design, pinned so it is noticed if it changes. These
        // tables' only pools carry the plural `conditions` array, so they are left out rather
        // than rolled every time - which, handed over whole, armed 2000 of 2000 zombies.
        expect([...over('loot_tables/entities/zombie_equipment.json', 50)]).toEqual([]);
        expect([...over('loot_tables/entities/fox_equipment.json', 50)]).toEqual([]);
    }, 180_000);

    it('asks for a table Java has no counterpart for, which is why it reads the Bedrock one', () => {
        // The reason this does not go through `ServerContent.loot`: Java equips a mob from
        // code, so its registry has `entities/skeleton` and no `entities/skeleton_gear`.
        expect(vanilla().loot.ids).toContain('minecraft:entities/skeleton');
        expect(vanilla().loot.ids).not.toContain('minecraft:entities/skeleton_gear');
        expect(vanilla().definitions.lootTables.has('loot_tables/entities/skeleton_gear.json')).toBe(true);
    }, 180_000);
});
