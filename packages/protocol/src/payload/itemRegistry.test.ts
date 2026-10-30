import { item_components, item_table } from '@jsprismarine/bedrock-data';
import { loadItemTypes } from '@jsprismarine/items';
import { describe, expect, it } from 'vitest';

import { nbtToPlain, readNetworkNbt, writeNetworkNbt } from './nbt';
import {
    BEDROCK_ONLY_ITEM_PROPERTY_DEFAULTS,
    FIRST_CUSTOM_ITEM_ID,
    ITEM_VERSION,
    buildItemRegistry
} from './itemRegistry';

import type { ItemType } from '@jsprismarine/items';
import type { PlainNbt } from './nbt';

const { types } = loadItemTypes();
const typeOf = (identifier: string): ItemType => {
    const type = types.get(identifier);
    if (type === undefined) throw new Error(`no item type for ${identifier}`);
    return type;
};

const componentsOf = (entry: { componentData?: Parameters<typeof writeNetworkNbt>[0] }): Record<string, PlainNbt> => {
    if (entry.componentData === undefined) throw new Error('the entry carries no components');
    const plain = nbtToPlain(entry.componentData);
    if (typeof plain !== 'object' || plain === null || Array.isArray(plain)) throw new Error('not a compound');
    const components = plain.components;
    if (typeof components !== 'object' || components === null || Array.isArray(components)) {
        throw new Error('no components compound');
    }
    return components;
};

describe('buildItemRegistry', () => {
    it('takes the number, the component flag and the version from the captured table', () => {
        const { entries, allocated } = buildItemRegistry([typeOf('minecraft:apple')], { table: item_table });

        expect(allocated).toEqual([]);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            name: 'minecraft:apple',
            runtimeId: item_table['minecraft:apple']!.runtime_id,
            componentBased: true,
            version: ITEM_VERSION.DataDriven
        });
    });

    it('sorts by identifier so two servers with the same items send the same packet', () => {
        const chosen = ['minecraft:stick', 'minecraft:apple', 'minecraft:bundle'].map(typeOf);
        const forwards = buildItemRegistry(chosen, { table: item_table });
        const backwards = buildItemRegistry([...chosen].reverse(), { table: item_table });

        expect(forwards.entries.map((entry) => entry.name)).toEqual([
            'minecraft:apple',
            'minecraft:bundle',
            'minecraft:stick'
        ]);
        expect(forwards.entries.map((entry) => entry.runtimeId)).toEqual(
            backwards.entries.map((entry) => entry.runtimeId)
        );
    });

    it('invents a data driven id for an item the table does not name, and says so', () => {
        const { entries, allocated } = buildItemRegistry([typeOf('minecraft:apple')], { table: {} });

        expect(allocated).toEqual([{ identifier: 'minecraft:apple', runtimeId: FIRST_CUSTOM_ITEM_ID }]);
        expect(entries[0]).toMatchObject({
            componentBased: true,
            version: ITEM_VERSION.DataDriven,
            runtimeId: FIRST_CUSTOM_ITEM_ID
        });
    });

    it('leaves out the component compound for an item the client already knows', () => {
        const notComponentBased = Object.entries(item_table).find(
            ([name, row]) => !row.component_based && types.has(name)
        );
        if (notComponentBased === undefined) throw new Error('the captured table has no plain item');

        const { entries } = buildItemRegistry([typeOf(notComponentBased[0])], { table: item_table });

        expect(entries[0]!.componentData).toBeUndefined();
    });

    it('sends the projection for every item when asked to', () => {
        const notComponentBased = Object.entries(item_table).find(
            ([name, row]) => !row.component_based && types.has(name)
        )!;
        const { entries } = buildItemRegistry([typeOf(notComponentBased[0])], {
            table: item_table,
            components: 'all'
        });

        expect(entries[0]!.componentData).toBeDefined();
    });

    describe('the component compound', () => {
        const apple = () =>
            componentsOf(buildItemRegistry([typeOf('minecraft:apple')], { table: item_table }).entries[0]!);

        it('is a single components key holding item_properties', () => {
            const plain = nbtToPlain(
                buildItemRegistry([typeOf('minecraft:apple')], { table: item_table }).entries[0]!.componentData!
            );

            expect(Object.keys(plain as Record<string, PlainNbt>)).toEqual(['components']);
            expect(Object.keys(apple())).toContain('item_properties');
        });

        it('writes every item_properties key the captured server writes', () => {
            const ours = Object.keys(apple().item_properties as Record<string, PlainNbt>);
            const captured = nbtToPlain(readNetworkNbt(item_components['minecraft:apple']!));
            const theirs = Object.keys(
                (captured as Record<string, Record<string, Record<string, PlainNbt>>>).components!.item_properties!
            );

            expect(ours.sort()).toEqual(theirs.sort());
        });

        it('fills the seven keys no Java component decides from the defaults', () => {
            const properties = apple().item_properties as Record<string, PlainNbt>;

            expect(properties.creative_group).toBe(`string:${BEDROCK_ONLY_ITEM_PROPERTY_DEFAULTS.creative_group}`);
            expect(properties.frame_count).toBe(`int:${BEDROCK_ONLY_ITEM_PROPERTY_DEFAULTS.frame_count}`);
            expect(properties.hidden_in_commands).toBe(
                `byte:${BEDROCK_ONLY_ITEM_PROPERTY_DEFAULTS.hidden_in_commands}`
            );
            expect(properties.should_despawn).toBe('byte:1');
            expect(properties.stacked_by_data).toBe('byte:0');
        });

        it('takes an override for the keys the creative catalog decides', () => {
            const { entries } = buildItemRegistry([typeOf('minecraft:apple')], {
                table: item_table,
                bedrockOnly: () => ({ creative_category: 2, creative_group: 'itemGroup.name.food' })
            });
            const properties = componentsOf(entries[0]!).item_properties as Record<string, PlainNbt>;

            expect(properties.creative_category).toBe('int:2');
            expect(properties.creative_group).toBe('string:itemGroup.name.food');
        });

        it('writes the food values the captured server writes', () => {
            expect(apple()['minecraft:food']).toEqual({
                can_always_eat: 'byte:0',
                nutrition: 'int:4',
                saturation_modifier: 'float:0.30000001192092896'
            });
        });

        it('writes max_stack_size as a byte in the component and an int in the properties', () => {
            const bundle = componentsOf(
                buildItemRegistry([typeOf('minecraft:bundle')], { table: item_table }).entries[0]!
            );

            expect(bundle['minecraft:max_stack_size']).toEqual({ value: 'byte:1' });
            expect((bundle.item_properties as Record<string, PlainNbt>).max_stack_size).toBe('int:1');
        });

        it('round trips through the writer and the reader', () => {
            const entry = buildItemRegistry([typeOf('minecraft:apple')], { table: item_table }).entries[0]!;

            expect(nbtToPlain(readNetworkNbt(writeNetworkNbt(entry.componentData!)))).toEqual(
                nbtToPlain(entry.componentData!)
            );
        });
    });

    describe('against the captured item components', () => {
        it('agrees on every item_properties value both sides derive, and reports the tally', () => {
            const shared = Object.keys(item_components).filter((name) => types.has(name));
            const { entries } = buildItemRegistry(shared.map(typeOf), { table: item_table, components: 'all' });

            let matched = 0;
            let compared = 0;
            const disagreements: string[] = [];

            for (const entry of entries) {
                const ours = componentsOf(entry).item_properties as Record<string, PlainNbt>;
                const captured = nbtToPlain(readNetworkNbt(item_components[entry.name]!));
                const theirs = (captured as Record<string, Record<string, Record<string, PlainNbt>>>).components
                    ?.item_properties;
                // The 47 foods the server sends components for without marking
                // them component based carry `minecraft:food` and nothing else.
                if (theirs === undefined) continue;
                compared++;

                for (const [key, value] of Object.entries(theirs)) {
                    // The seven the capture fills from its own tables and the
                    // icon, which is a resource pack fact; `BEDROCK_ONLY_ITEM_
                    // PROPERTIES` in `@jsprismarine/items` names them.
                    if (key in BEDROCK_ONLY_ITEM_PROPERTY_DEFAULTS || key === 'minecraft:icon') continue;
                    if (ours[key] === value) matched++;
                    else disagreements.push(`${entry.name} ${key}: ${String(ours[key])}, expected ${String(value)}`);
                }
            }

            const total = matched + disagreements.length;
            console.debug(
                `item_properties: ${matched}/${total} match over ${compared} items, ` + `${disagreements.length} differ`
            );
            if (disagreements.length > 0) console.debug(disagreements.slice(0, 30).join('\n'));

            // Java decides these values and Bedrock's own table decides the
            // capture's, so some disagreement is the two editions disagreeing
            // rather than a bug. The number is the point; the bound keeps a
            // regression from hiding inside it.
            expect(matched / total).toBeGreaterThan(0.85);
        });
    });
});
