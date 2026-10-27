import { describe, expect, it } from 'vitest';

import { buildServerContent } from '../content/ServerContent';
import type { ServerContent } from '../content/ServerContent';
import { itemOfDrop } from '../inventory/persistence';
import { Item } from '../item/Item';
import {
    MOB_EQUIPMENT_SLOTS,
    mobEquipmentSlotOf,
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
            expect(mobEquipmentSlotOf('slot.armor.body')).toBe('body');
        });

        it('accepts the bare slot name, which is how an item component spells it', () => {
            for (const slot of MOB_EQUIPMENT_SLOTS) expect(mobEquipmentSlotOf(slot)).toBe(slot);
        });

        it('answers nothing for a slot no mob equipment packet carries', () => {
            // The pillager captain's banner names this one, and the body slot holds horse armor.
            expect(mobEquipmentSlotOf('slot.armor.saddle')).toBeUndefined();
            expect(mobEquipmentSlotOf('slot.hotbar')).toBeUndefined();
            expect(mobEquipmentSlotOf('other.mainhand')).toBeUndefined();
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
        // The weapon pools of these six carry no gate at all, so every roll produces one. This
        // is the census the whole change exists for: before it, every one of these was empty.
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

    it('arms a zombie at the rate its table states rather than every time or never', () => {
        // The number the whole dialect exists for. `zombie_equipment.json` gates its weapon
        // pool on `random_regional_difficulty_chance` at `max_chance: 0.05`, which the Java
        // grammar read as no gate at all (2000 of 2000) and the pruning read as no pool at all
        // (0 of 2000).
        const rolls = 2000;
        const counts = over('loot_tables/entities/zombie_equipment.json', rolls);
        const armed = [...counts].filter(([key]) => key.startsWith('mainhand:')).reduce((sum, [, n]) => sum + n, 0);
        const wearing = [...counts].filter(([key]) => key.startsWith('head:')).reduce((sum, [, n]) => sum + n, 0);

        console.debug(`zombie_equipment.json over ${rolls} rolls: armed ${armed}, helmeted ${wearing}`);

        expect(armed / rolls).toBeGreaterThan(0.02);
        expect(armed / rolls).toBeLessThan(0.08);
        // The armor pool runs at 0.15, and every set starts with a helmet.
        expect(wearing / rolls).toBeGreaterThan(0.1);
        expect(wearing / rolls).toBeLessThan(0.2);
    }, 180_000);

    it('dresses a mob in the tiered armor sets, which the pruning dropped whole', () => {
        // The `tiers` ladder over six sets, reached through nested entry `pools`, which is the
        // part of the grammar nothing here could read before.
        const worn = new Set(
            [...over('loot_tables/entities/skeleton_gear.json', 500).keys()].filter(
                (key) => !key.startsWith('mainhand:')
            )
        );

        expect(worn.size).toBeGreaterThan(0);
        expect([...worn].some((key) => key.startsWith('head:'))).toBe(true);
    }, 180_000);

    it('holds an item on every vanilla type whose component names a table', () => {
        const content = vanilla();
        const registry = content.equipmentLoot;

        // Every `minecraft:equipment.table` a type names, base definition and
        // component groups alike, because a zombie names one table as itself
        // and another as a rider.
        const named = new Map<string, Set<string>>();
        const visit = (type: string, value: unknown): void => {
            if (Array.isArray(value)) {
                for (const member of value) visit(type, member);
                return;
            }
            if (value === null || typeof value !== 'object') return;
            for (const [key, member] of Object.entries(value)) {
                if (key === 'minecraft:equipment' && member !== null && typeof member === 'object') {
                    const table = (member as Record<string, unknown>)['table'];
                    if (typeof table === 'string') named.set(type, (named.get(type) ?? new Set()).add(table));
                }
                visit(type, member);
            }
        };
        for (const [type, definition] of content.definitions.entities) visit(type, definition.data);

        const tables = new Set([...named.values()].flatMap((own) => [...own]));
        const rolls = 200;
        const rollsSomething = (table: string): boolean =>
            Array.from({ length: rolls }).some(
                () =>
                    Object.keys(rollMobEquipment({ content, table, itemOf: (drop) => itemOfDrop(drop, content) }))
                        .length > 0
            );
        const producing = [...tables].filter(rollsSomething);

        console.debug(
            `${named.size} of ${content.definitions.entities.size} vanilla types carry the component, ` +
                `naming ${tables.size} tables, of which ${producing.length} roll something in ${rolls} bodies`
        );

        // Every table a component names rolls something. Under the pruning,
        // five of them had no pool left to roll and produced nothing at any
        // sample size, zombies among them.
        expect([...tables].sort()).toEqual(producing.sort());
        expect(tables.size).toBe(18);

        // Read rather than guessed: the registry compiled all 18 with no error,
        // and the only thing it reports is the `functions` it names and skips.
        expect(registry.diagnostics.errors).toEqual([]);
    }, 180_000);

    it('asks for a table Java has no counterpart for, which is why it reads the Bedrock one', () => {
        // The reason this does not go through `ServerContent.loot`: Java equips a mob from
        // code, so its registry has `entities/skeleton` and no `entities/skeleton_gear`.
        expect(vanilla().loot.ids).toContain('minecraft:entities/skeleton');
        expect(vanilla().loot.ids).not.toContain('minecraft:entities/skeleton_gear');
        expect(vanilla().definitions.lootTables.has('loot_tables/entities/skeleton_gear.json')).toBe(true);
    }, 180_000);
});
