import { describe, expect, it } from 'vitest';

import { loadItemTypes } from './itemTypes';
import {
    BEDROCK_ONLY_ITEM_PROPERTIES,
    enchantableSlotOf,
    projectItemToBedrock,
    UNPROJECTED_BEDROCK_COMPONENTS
} from './projection';

const { types } = loadItemTypes({ strict: true });
const project = (identifier: string) => projectItemToBedrock(types.get(identifier)!);

/**
 * The 44 components `Item Components.json` documents for a Bedrock item
 * definition, plus the five internal ones the documentation lists beside them
 * and the two keys a server writes outside that list, `item_properties` and
 * `item_tags`. Taken from
 * docs/research/bedrock-blocks-items-recipes-biomes-features.md section 3.
 */
const DOCUMENTED_BEDROCK_COMPONENTS = new Set([
    'item_properties',
    'item_tags',
    'minecraft:allow_off_hand',
    'minecraft:block_placer',
    'minecraft:bundle_interaction',
    'minecraft:can_destroy_in_creative',
    'minecraft:chargeable',
    'minecraft:compostable',
    'minecraft:cooldown',
    'minecraft:custom_components',
    'minecraft:damage',
    'minecraft:damage_absorption',
    'minecraft:digger',
    'minecraft:display_name',
    'minecraft:durability',
    'minecraft:durability_sensor',
    'minecraft:dyeable',
    'minecraft:enchantable',
    'minecraft:entity_placer',
    'minecraft:fire_resistant',
    'minecraft:food',
    'minecraft:fuel',
    'minecraft:glint',
    'minecraft:hand_equipped',
    'minecraft:hover_text_color',
    'minecraft:icon',
    'minecraft:interact_button',
    'minecraft:kinetic_weapon',
    'minecraft:liquid_clipped',
    'minecraft:max_stack_size',
    'minecraft:piercing_weapon',
    'minecraft:projectile',
    'minecraft:rarity',
    'minecraft:record',
    'minecraft:render_offsets',
    'minecraft:repairable',
    'minecraft:shooter',
    'minecraft:should_despawn',
    'minecraft:stacked_by_data',
    'minecraft:storage_item',
    'minecraft:storage_weight_limit',
    'minecraft:storage_weight_modifier',
    'minecraft:swing_duration',
    'minecraft:swing_sounds',
    'minecraft:tags',
    'minecraft:throwable',
    'minecraft:use_animation',
    'minecraft:use_duration',
    'minecraft:use_modifiers',
    'minecraft:wearable',
    'minecraft:weapon'
]);

/** The `item_properties` keys a Bedrock Dedicated Server 1.26.51.1 writes. */
const CAPTURED_ITEM_PROPERTY_KEYS = new Set([
    'allow_off_hand',
    'can_destroy_in_creative',
    'creative_category',
    'creative_group',
    'damage',
    'enchantable_slot',
    'enchantable_value',
    'foil',
    'frame_count',
    'hand_equipped',
    'hidden_in_commands',
    'liquid_clipped',
    'max_stack_size',
    'minecraft:icon',
    'mining_speed',
    'should_despawn',
    'stacked_by_data',
    'use_animation',
    'use_duration'
]);

describe('the Bedrock item component projection', () => {
    it('emits only names Bedrock documents, which are not the Java ones', () => {
        for (const identifier of types.keys()) {
            for (const name of Object.keys(project(identifier))) {
                expect(DOCUMENTED_BEDROCK_COMPONENTS.has(name)).toBe(true);
            }
        }
    });

    it('emits only item_properties keys a real server writes', () => {
        for (const identifier of types.keys()) {
            for (const key of Object.keys(project(identifier).item_properties)) {
                expect(CAPTURED_ITEM_PROPERTY_KEYS.has(key)).toBe(true);
            }
        }
    });

    it('leaves the Bedrock-only keys to the protocol layer', () => {
        const apple = project('minecraft:apple').item_properties;
        for (const key of BEDROCK_ONLY_ITEM_PROPERTIES) expect(key in apple).toBe(false);
        for (const name of Object.keys(UNPROJECTED_BEDROCK_COMPONENTS)) {
            expect(DOCUMENTED_BEDROCK_COMPONENTS.has(name)).toBe(true);
        }
    });

    it('reproduces what a Bedrock Dedicated Server sends for the apple', () => {
        const apple = project('minecraft:apple');
        // Captured values: max_stack_size 64, use_duration 32, use_animation 1,
        // minecraft:food nutrition 4 saturation_modifier 0.3.
        expect(apple.item_properties.max_stack_size).toBe(64);
        expect(apple.item_properties.use_duration).toBe(32);
        expect(apple.item_properties.use_animation).toBe(1);
        expect(apple.item_properties.foil).toBe(false);
        expect(apple['minecraft:food']).toEqual({
            nutrition: 4,
            saturation_modifier: 0.3,
            can_always_eat: false
        });
        expect(apple['minecraft:use_animation']).toEqual({ value: 'eat' });
        expect(apple['minecraft:use_duration']).toBe(32);
        expect(apple['minecraft:max_stack_size']).toEqual({ value: 64 });
    });

    it('turns Java durability and attack damage into the Bedrock pair', () => {
        const pickaxe = project('minecraft:diamond_pickaxe');
        expect(pickaxe['minecraft:durability']).toEqual({
            max_durability: 1561,
            damage_chance: { min: 0, max: 100 }
        });
        expect(pickaxe['minecraft:damage']).toEqual({ value: 4 });
        expect(pickaxe.item_properties.hand_equipped).toBe(true);
        expect(pickaxe['minecraft:enchantable']).toEqual({ slot: 'pickaxe', value: 10 });
    });

    it('derives the Bedrock enchanting category Java has no field for', () => {
        expect(enchantableSlotOf(types.get('minecraft:diamond_pickaxe')!)).toBe('pickaxe');
        expect(enchantableSlotOf(types.get('minecraft:diamond_axe')!)).toBe('axe');
        expect(enchantableSlotOf(types.get('minecraft:diamond_shovel')!)).toBe('shovel');
        expect(enchantableSlotOf(types.get('minecraft:diamond_hoe')!)).toBe('hoe');
        expect(enchantableSlotOf(types.get('minecraft:diamond_sword')!)).toBe('sword');
        expect(enchantableSlotOf(types.get('minecraft:diamond_helmet')!)).toBe('armor_head');
        expect(enchantableSlotOf(types.get('minecraft:diamond_chestplate')!)).toBe('armor_torso');
        expect(enchantableSlotOf(types.get('minecraft:shield')!)).toBe('shield');
        expect(enchantableSlotOf(types.get('minecraft:elytra')!)).toBe('elytra');
        expect(enchantableSlotOf(types.get('minecraft:copper_spear')!)).toBe('melee_spear');
        expect(enchantableSlotOf(types.get('minecraft:apple')!)).toBe('none');
    });

    it('turns armor into the Bedrock wearable component', () => {
        expect(project('minecraft:diamond_chestplate')['minecraft:wearable']).toEqual({
            slot: 'slot.armor.chest',
            protection: 8
        });
    });

    it('resolves a 26.3 fuel reference into Bedrock seconds', () => {
        expect(project('minecraft:coal')['minecraft:fuel']).toEqual({ duration: 80 });
        expect(project('minecraft:lava_bucket')['minecraft:fuel']).toEqual({ duration: 1000 });
        expect(project('minecraft:apple')['minecraft:fuel']).toBeUndefined();
    });

    it('turns a composter layer provider into a Bedrock composting chance', () => {
        expect(project('minecraft:apple')['minecraft:compostable']).toEqual({ composting_chance: 65 });
        expect(project('minecraft:cake')['minecraft:compostable']).toEqual({ composting_chance: 100 });
    });

    it('carries the use remainder only when a caller supplies an identifier mapper', () => {
        const stew = types.get('minecraft:mushroom_stew')!;
        expect(projectItemToBedrock(stew)['minecraft:food']?.using_converts_to).toBeUndefined();
        const mapped = projectItemToBedrock(stew, { mapIdentifier: (javaId) => javaId.replace('minecraft:', '') });
        expect(mapped['minecraft:food']?.using_converts_to).toBe('bowl');
    });

    it('marks a netherite item fire resistant', () => {
        expect(project('minecraft:netherite_ingot')['minecraft:fire_resistant']).toEqual({ value: true });
        expect(project('minecraft:iron_ingot')['minecraft:fire_resistant']).toBeUndefined();
    });

    it('projects every item without throwing', () => {
        for (const identifier of types.keys()) expect(() => project(identifier)).not.toThrow();
    });
});
