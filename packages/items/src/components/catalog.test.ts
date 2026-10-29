import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { reportProgress } from '../../../../.test/reportProgress';

import { createItemComponentRegistry, ITEM_COMPONENT_NAMES, ITEM_COMPONENTS } from './catalog';
import { STACK_ONLY_COMPONENTS, UNVERIFIED_SHAPE_COMPONENTS } from './stackOnly';
import { DEFAULTED_COMPONENTS } from './defaults';
import { UNIVERSAL_COMPONENTS } from './universal';
import { itemTypesTable } from '../tables';

const registry = createItemComponentRegistry();

const bind = (name: string, value: unknown) =>
    registry.bind(name, value, {
        identifier: 'minecraft:test',
        definition: { identifier: 'minecraft:test', registry: 'items', pack: 'test', path: 'test.json', data: {} }
    });

const accept = (name: string, value: unknown): unknown => {
    const result = bind(name, value);
    if (!result.ok) throw new Error(`${name} rejected ${JSON.stringify(value)}: ${result.message}`);
    return result.value.params;
};

describe('the item component catalog', () => {
    it('registers every data component type the pinned Java registry report lists', () => {
        expect([...ITEM_COMPONENT_NAMES].sort()).toEqual([...itemTypesTable.componentTypes].sort());
        reportProgress(`${ITEM_COMPONENT_NAMES.length} item component types are registered.`);
    });

    it('assigns each component to one data-derived default group', () => {
        const grouped = [...UNIVERSAL_COMPONENTS, ...DEFAULTED_COMPONENTS, ...STACK_ONLY_COMPONENTS].map(
            (component) => component.name
        );

        expect(new Set(grouped).size).toBe(grouped.length);
        expect([...grouped].sort()).toEqual([...ITEM_COMPONENT_NAMES].sort());

        const defaulted = new Set(Object.keys(itemTypesTable.defaultCounts));
        for (const component of [...UNIVERSAL_COMPONENTS, ...DEFAULTED_COMPONENTS]) {
            expect(defaulted.has(component.name)).toBe(true);
        }
        for (const component of STACK_ONLY_COMPONENTS) expect(defaulted.has(component.name)).toBe(false);
        reportProgress(
            `Item component groups: ${UNIVERSAL_COMPONENTS.length} universal, ${DEFAULTED_COMPONENTS.length} defaulted, ${STACK_ONLY_COMPONENTS.length} stack-only.`
        );
    });

    it('gives every universal component a default on every Java item', () => {
        for (const component of UNIVERSAL_COMPONENTS) {
            expect(itemTypesTable.defaultCounts[component.name]).toBe(itemTypesTable.javaItemCount);
        }
    });

    it('registers no name twice', () => {
        expect(new Set(ITEM_COMPONENT_NAMES).size).toBe(ITEM_COMPONENTS.length);
    });

    it('declares no hooks, because item behavior lives in behavior families', () => {
        for (const component of ITEM_COMPONENTS) expect(component.hooks).toEqual([]);
    });

    it('keeps the unverified shape list down to the types no pinned source writes', () => {
        for (const name of UNVERIFIED_SHAPE_COMPONENTS) {
            expect(itemTypesTable.defaultCounts[name]).toBeUndefined();
        }
    });
});

describe('parsing the components vanilla uses as defaults', () => {
    it('parses universal components from item definitions', () => {
        expect(accept('minecraft:max_stack_size', 64)).toBe(64);
        expect(accept('minecraft:rarity', 'uncommon')).toBe('uncommon');
        expect(accept('minecraft:repair_cost', 0)).toBe(0);
        expect(accept('minecraft:break_sound', 'minecraft:entity.item.break')).toBe('minecraft:entity.item.break');
        expect(accept('minecraft:item_model', 'minecraft:apple')).toBe('minecraft:apple');
        expect(accept('minecraft:item_name', { translate: 'item.minecraft.apple' })).toEqual({
            translate: 'item.minecraft.apple'
        });
        expect(accept('minecraft:lore', [])).toEqual([]);
        expect(accept('minecraft:enchantments', { 'minecraft:sharpness': 3 })).toEqual({ 'minecraft:sharpness': 3 });
        expect(accept('minecraft:attack_animation', { type: 'stab', duration: 17 })).toEqual({
            type: 'stab',
            duration: 17
        });
        expect(accept('minecraft:interact_animation', {})).toEqual({});
        expect(accept('minecraft:tooltip_display', { hidden_components: ['minecraft:banner_patterns'] })).toEqual({
            hidden_components: ['minecraft:banner_patterns']
        });
        expect(
            accept('minecraft:use_effects', { can_sprint: true, interact_vibrations: false, speed_multiplier: 1 })
        ).toEqual({ can_sprint: true, interact_vibrations: false, speed_multiplier: 1 });
        expect(
            accept('minecraft:attribute_modifiers', [
                {
                    type: 'minecraft:attack_damage',
                    amount: 4,
                    id: 'minecraft:base_attack_damage',
                    operation: 'add_value',
                    slot: 'mainhand'
                }
            ])
        ).toEqual([
            {
                type: 'minecraft:attack_damage',
                amount: 4,
                id: 'minecraft:base_attack_damage',
                operation: 'add_value',
                slot: 'mainhand'
            }
        ]);
    });

    it('parses the food and consumable pair', () => {
        expect(accept('minecraft:food', { nutrition: 4, saturation: 2.4 })).toEqual({ nutrition: 4, saturation: 2.4 });
        expect(accept('minecraft:food', { can_always_eat: true, nutrition: 6, saturation: 7.2 })).toEqual({
            can_always_eat: true,
            nutrition: 6,
            saturation: 7.2
        });
        expect(
            accept('minecraft:consumable', { on_consume_effects: [{ type: 'minecraft:teleport_randomly' }] })
        ).toEqual({ on_consume_effects: [{ type: 'minecraft:teleport_randomly' }] });
        expect(accept('minecraft:use_remainder', { id: 'minecraft:bowl' })).toEqual({ id: 'minecraft:bowl' });
        expect(accept('minecraft:villager_food', { nutrition: 1 })).toEqual({ nutrition: 1 });
    });

    it('parses tool rules in all three block set forms', () => {
        const parsed = accept('minecraft:tool', {
            rules: [
                { blocks: '#minecraft:incorrect_for_diamond_tool', correct_for_drops: false },
                { blocks: 'minecraft:cobweb', correct_for_drops: true, speed: 15 },
                { blocks: ['minecraft:oak_log', 'minecraft:birch_log'], speed: 5 }
            ]
        });
        expect(parsed).toEqual({
            rules: [
                { blocks: { kind: 'tag', tag: 'minecraft:incorrect_for_diamond_tool' }, correct_for_drops: false },
                { blocks: { kind: 'entries', entries: ['minecraft:cobweb'] }, correct_for_drops: true, speed: 15 },
                { blocks: { kind: 'entries', entries: ['minecraft:oak_log', 'minecraft:birch_log'] }, speed: 5 }
            ]
        });
    });

    it('parses the weapon, spear and shield components', () => {
        expect(accept('minecraft:weapon', { item_damage_per_attack: 2, disable_blocking_for_seconds: 5 })).toEqual({
            item_damage_per_attack: 2,
            disable_blocking_for_seconds: 5
        });
        expect(accept('minecraft:damage_type', 'minecraft:spear')).toBe('minecraft:spear');
        expect(accept('minecraft:minimum_attack_charge', 1)).toBe(1);
        expect(
            accept('minecraft:attack_range', {
                hitbox_margin: 0.125,
                max_creative_reach: 6.5,
                max_reach: 4.5,
                min_creative_reach: 2,
                min_reach: 2,
                mob_factor: 0.5
            })
        ).toEqual({
            hitbox_margin: 0.125,
            max_creative_reach: 6.5,
            max_reach: 4.5,
            min_creative_reach: 2,
            min_reach: 2,
            mob_factor: 0.5
        });
        expect(
            accept('minecraft:blocks_attacks', {
                block_delay_seconds: 0.25,
                block_sound: 'minecraft:item.shield.block',
                bypassed_by: '#minecraft:bypasses_shield',
                item_damage: { base: 1, factor: 1, threshold: 3 }
            })
        ).toEqual({
            block_delay_seconds: 0.25,
            block_sound: 'minecraft:item.shield.block',
            bypassed_by: { kind: 'tag', tag: 'minecraft:bypasses_shield' },
            item_damage: { base: 1, factor: 1, threshold: 3 }
        });
    });

    it('parses the durability and repair components', () => {
        expect(accept('minecraft:damage', 0)).toBe(0);
        expect(accept('minecraft:max_damage', 1561)).toBe(1561);
        expect(accept('minecraft:enchantable', { value: 10 })).toEqual({ value: 10 });
        expect(accept('minecraft:repairable', { items: '#minecraft:diamond_tool_materials' })).toEqual({
            items: { kind: 'tag', tag: 'minecraft:diamond_tool_materials' }
        });
    });

    it('parses 26.3 provider-backed fuel and compost values in all three forms', () => {
        expect(
            accept('minecraft:cooking_fuel', {
                burn_time: 'minecraft:cooking/time_boats',
                speed_multiplier: 'minecraft:cooking/speed_default'
            })
        ).toEqual({
            burn_time: { kind: 'reference', id: 'minecraft:cooking/time_boats' },
            speed_multiplier: { kind: 'reference', id: 'minecraft:cooking/speed_default' }
        });
        expect(accept('minecraft:cooking_fuel', { burn_time: 200 })).toEqual({
            burn_time: { kind: 'inline', value: 200 }
        });
        expect(
            accept('minecraft:compostable', { layers: { type: 'minecraft:weighted_list', distribution: [] } })
        ).toEqual({ layers: { kind: 'provider', provider: { type: 'minecraft:weighted_list', distribution: [] } } });
    });

    it('parses the equippable component including its allowed entity set', () => {
        expect(
            accept('minecraft:equippable', {
                allowed_entities: '#minecraft:can_equip_harness',
                asset_id: 'minecraft:black_harness',
                can_be_sheared: true,
                equip_on_interact: true,
                equip_sound: 'minecraft:entity.happy_ghast.equip',
                slot: 'body'
            })
        ).toEqual({
            allowed_entities: { kind: 'tag', tag: 'minecraft:can_equip_harness' },
            asset_id: 'minecraft:black_harness',
            can_be_sheared: true,
            equip_on_interact: true,
            equip_sound: 'minecraft:entity.happy_ghast.equip',
            slot: 'body'
        });
    });

    it('rejects a value of the wrong shape and names what it wanted', () => {
        expect(bind('minecraft:max_stack_size', 'sixty four')).toMatchObject({ ok: false });
        expect(bind('minecraft:max_stack_size', 1000)).toMatchObject({ ok: false });
        expect(bind('minecraft:rarity', 'legendary')).toMatchObject({ ok: false });
        expect(bind('minecraft:food', { nutrition: 4 })).toMatchObject({ ok: false, message: 'missing saturation' });
        expect(bind('minecraft:tool', { rules: [{}] })).toMatchObject({ ok: false });
    });

    it('drops an unknown key instead of failing, because Mojang adds fields within a release', () => {
        expect(accept('minecraft:food', { nutrition: 4, saturation: 2.4, something_new: 7 })).toEqual({
            nutrition: 4,
            saturation: 2.4
        });
    });
});

/**
 * The corpus test. It needs Mojang's data generator output, which is not
 * committed, so it is skipped unless `JSP_JAVA_REPORTS` points at the
 * `generated` directory the generator wrote.
 */
const reportsRoot = process.env.JSP_JAVA_REPORTS;
const componentsDir = reportsRoot === undefined ? undefined : resolve(reportsRoot, 'reports/minecraft/components/item');
const corpus = componentsDir !== undefined && existsSync(componentsDir) ? describe : describe.skip;

corpus('every real Java item component file', { tags: ['real-data'] }, () => {
    it('parses the Java item component reports without errors', () => {
        const files = readdirSync(componentsDir!).filter((file) => file.endsWith('.json'));
        const failures: string[] = [];
        let parsed = 0;
        for (const file of files) {
            // The report is Mojang's own JSON; only the one key this test reads is typed.
            const report = JSON.parse(readFileSync(join(componentsDir!, file), 'utf8')) as {
                components?: Record<string, unknown>;
            };
            for (const [name, value] of Object.entries(report.components ?? {})) {
                const result = bind(name, value);
                if (result.ok) parsed += 1;
                else failures.push(`${file} ${name}: ${result.message}`);
            }
        }

        expect(failures).toEqual([]);
        expect(parsed).toBeGreaterThan(0);
        reportProgress(`${parsed} Java item component values parsed across ${files.length} reports.`);
    });
});
