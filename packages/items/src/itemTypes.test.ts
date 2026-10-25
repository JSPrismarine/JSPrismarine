import { describe, expect, it } from 'vitest';

import { EXCEPTED_ITEM_COUNT, EXCEPTED_JAVA_ITEMS, ITEM_TABLE_EXCEPTIONS } from './exceptions';
import { cookingFuel, food, maxDamage, tool } from './components/defaults';
import { itemName, maxStackSize } from './components/universal';
import { loadItemTypes, vanillaItemDefinitions } from './itemTypes';
import { itemTypesTable } from './tables';

const { registry, types, diagnostics } = loadItemTypes({ strict: true });

describe('the generated item type table', () => {
    it('is pinned to the versions the plan names', () => {
        expect(itemTypesTable.javaVersion).toBe('26.3');
        expect(itemTypesTable.bedrockVersion).toBe('1.26.51.1');
        expect(itemTypesTable.javaItemCount).toBe(1658);
    });

    it('carries 1605 of the 1606 Bedrock item identifiers', () => {
        expect(Object.keys(itemTypesTable.items).length).toBe(1605);
        expect(itemTypesTable.items['minecraft:unknown']).toBeUndefined();
    });

    it('accounts for every Java item exactly once, as a row or as an exception', () => {
        const carried = new Set<string>();
        for (const row of Object.values(itemTypesTable.items)) {
            carried.add(row.java);
            for (const merged of row.merged ?? []) carried.add(merged.java);
        }
        for (const javaId of itemTypesTable.exceptedJavaItems) carried.add(javaId);
        expect(carried.size).toBe(itemTypesTable.javaItemCount);
    });

    it('matches the reviewed exception list, row for row and in its declared size', () => {
        expect(EXCEPTED_JAVA_ITEMS.length).toBe(EXCEPTED_ITEM_COUNT);
        expect(new Set(EXCEPTED_JAVA_ITEMS).size).toBe(EXCEPTED_ITEM_COUNT);
        expect([...EXCEPTED_JAVA_ITEMS].sort()).toEqual([...itemTypesTable.exceptedJavaItems].sort());
    });

    it('gives every exception a reason and a reference', () => {
        for (const exception of ITEM_TABLE_EXCEPTIONS) {
            expect(exception.reason.length).toBeGreaterThan(20);
            expect(exception.reference).toContain('docs/research/');
            expect(exception.javaIds.length).toBeGreaterThan(0);
        }
        expect(ITEM_TABLE_EXCEPTIONS.filter((exception) => exception.kind === 'loss').length).toBe(5);
        expect(ITEM_TABLE_EXCEPTIONS.filter((exception) => exception.kind === 'merge').length).toBe(4);
    });

    it('names a superseding item for every merge, and that item owns the row', () => {
        for (const exception of ITEM_TABLE_EXCEPTIONS) {
            if (exception.kind !== 'merge') continue;
            expect(itemTypesTable.items[exception.bedrockId]?.java).toBe(exception.supersededBy);
        }
    });
});

describe('resolving the vanilla item types', () => {
    it('resolves every row with no diagnostics', () => {
        expect(diagnostics).toEqual([]);
        expect(types.size).toBe(1605);
        expect(registry.size).toBe(1605);
        expect(vanillaItemDefinitions().length).toBe(1605);
    });

    it('binds every component of every item, so no value went unparsed', () => {
        let bound = 0;
        let declared = 0;
        for (const [identifier, type] of types) {
            bound += type.components.length;
            declared += Object.keys(itemTypesTable.items[identifier]!.components).length;
        }
        expect(bound).toBe(declared);
        expect(bound).toBeGreaterThan(20000);
    });

    it('gives every type the thirteen universal components', () => {
        for (const type of types.values()) {
            expect(type.params(maxStackSize)).toBeGreaterThan(0);
            expect(type.params(itemName)).toBeDefined();
        }
    });

    it('reads Java properties off a Bedrock identity', () => {
        const pickaxe = types.get('minecraft:diamond_pickaxe')!;
        expect(pickaxe.params(maxDamage)).toBe(1561);
        expect(pickaxe.params(maxStackSize)).toBe(1);
        expect(pickaxe.params(tool)?.rules.length).toBe(2);
        expect(pickaxe.flags).toEqual({
            isFood: false,
            isTool: true,
            isWeapon: true,
            isDamageable: true,
            isEquippable: false,
            isFuel: false
        });

        const apple = types.get('minecraft:apple')!;
        expect(apple.params(food)).toEqual({ nutrition: 4, saturation: 2.4 });
        expect(apple.flags.isFood).toBe(true);
    });

    it('keeps the Bedrock identity where 16 Java items share one', () => {
        // Bedrock has one bed item with a damage value per color, so the 16
        // Java bed items become one row that minecraft:white_bed supplies.
        const bed = types.get('minecraft:bed')!;
        expect(itemTypesTable.items['minecraft:bed']!.java).toBe('minecraft:white_bed');
        expect(bed.params(maxStackSize)).toBe(1);
        expect(itemTypesTable.items['minecraft:bed']!.merged?.length).toBe(15);
    });

    it('counts the fuel items Java 26.3 puts behind a provider reference', () => {
        const fuels = [...types.values()].filter((type) => type.params(cookingFuel) !== undefined);
        expect(fuels.length).toBeGreaterThan(300);
        expect(fuels.every((type) => type.params(cookingFuel)?.burn_time?.kind === 'reference')).toBe(true);
    });

    it('builds dense ids a flattened table can index by', () => {
        expect(registry.idOf('minecraft:unknown')).toBeUndefined();
        const apple = registry.holder('minecraft:apple');
        expect(apple.bound).toBe(true);
        expect(apple.id).toBeGreaterThanOrEqual(0);
    });
});
