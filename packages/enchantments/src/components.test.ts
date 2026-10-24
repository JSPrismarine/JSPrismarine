import { describe, expect, it } from 'vitest';

import { EFFECT_COMPONENTS, EFFECT_COMPONENT_TYPES, parseEffects } from './components';
import type { EffectComponentType } from './components';

const parse = (json: unknown) => {
    const { value, diagnostics } = parseEffects(json);
    expect(diagnostics).toEqual([]);
    return value;
};

const parseOne = (component: EffectComponentType, body: unknown) => {
    const effects = parse({ [`minecraft:${component}`]: body });
    const parsed = effects.get(component);
    expect(parsed).toBeDefined();
    return parsed;
};

/** One syntactically valid body per component, taken from the 26.3 vanilla files where one exists. */
const BODIES: Readonly<Record<EffectComponentType, unknown>> = {
    damage_protection: [{ effect: { type: 'minecraft:add', value: 1 } }],
    damage_immunity: [{ effect: {}, requirements: { type: 'minecraft:random_chance', chance: 1 } }],
    damage: [{ effect: { type: 'minecraft:add', value: 1 } }],
    smash_damage_per_fallen_block: [{ effect: { type: 'minecraft:add', value: 0.5 } }],
    knockback: [{ effect: { type: 'minecraft:add', value: 1 } }],
    armor_effectiveness: [{ effect: { type: 'minecraft:add', value: -0.15 } }],
    post_attack: [
        {
            affected: 'attacker',
            enchanted: 'victim',
            effect: { type: 'minecraft:damage_entity', damage_type: 'minecraft:thorns', min_damage: 1, max_damage: 5 }
        }
    ],
    post_piercing_attack: [{ effect: { type: 'minecraft:change_item_damage', amount: 1 } }],
    hit_block: [{ effect: { type: 'minecraft:summon_entity', entity: 'minecraft:lightning_bolt' } }],
    item_damage: [{ effect: { type: 'minecraft:remove_binomial', chance: 0.5 } }],
    equipment_drops: [{ enchanted: 'attacker', effect: { type: 'minecraft:add', value: 0.01 } }],
    location_changed: [
        {
            effect: {
                type: 'minecraft:attribute',
                amount: 1,
                attribute: 'minecraft:movement_speed',
                id: 'minecraft:enchantment.test',
                operation: 'add_value'
            }
        }
    ],
    tick: [{ effect: { type: 'minecraft:play_sound', sound: 'minecraft:particle.soul_escape', volume: 1, pitch: 1 } }],
    ammo_use: [{ effect: { type: 'minecraft:set', value: 0 } }],
    projectile_piercing: [{ effect: { type: 'minecraft:add', value: 1 } }],
    projectile_spawned: [{ effect: { type: 'minecraft:ignite', duration: 100 } }],
    projectile_spread: [{ effect: { type: 'minecraft:add', value: 10 } }],
    projectile_count: [{ effect: { type: 'minecraft:add', value: 2 } }],
    trident_return_acceleration: [{ effect: { type: 'minecraft:add', value: 1 } }],
    fishing_time_reduction: [{ effect: { type: 'minecraft:add', value: -5 } }],
    fishing_luck_bonus: [{ effect: { type: 'minecraft:add', value: 1 } }],
    block_experience: [{ effect: { type: 'minecraft:set', value: 0 } }],
    mob_experience: [{ effect: { type: 'minecraft:multiply', factor: 2 } }],
    repair_with_xp: [{ effect: { type: 'minecraft:multiply', factor: 2 } }],
    attributes: [
        {
            amount: { type: 'minecraft:levels_squared', added: 1.0 },
            attribute: 'minecraft:mining_efficiency',
            id: 'minecraft:enchantment.efficiency',
            operation: 'add_value'
        }
    ],
    crossbow_charge_time: { type: 'minecraft:add', value: -0.25 },
    crossbow_charging_sounds: [
        { start: 'minecraft:item.crossbow.quick_charge_1', end: 'minecraft:item.crossbow.loading_end' }
    ],
    trident_sound: ['minecraft:item.trident.riptide_1'],
    prevent_equipment_drop: {},
    prevent_armor_change: {},
    trident_spin_attack_strength: { type: 'minecraft:add', value: 1.5 }
};

describe('the 31 effect component types', () => {
    it('declares exactly the 31 names the 26.3 registry holds', () => {
        expect(EFFECT_COMPONENT_TYPES).toHaveLength(31);
        expect(EFFECT_COMPONENT_TYPES.toSorted()).toEqual(
            [
                'ammo_use',
                'armor_effectiveness',
                'attributes',
                'block_experience',
                'crossbow_charge_time',
                'crossbow_charging_sounds',
                'damage',
                'damage_immunity',
                'damage_protection',
                'equipment_drops',
                'fishing_luck_bonus',
                'fishing_time_reduction',
                'hit_block',
                'item_damage',
                'knockback',
                'location_changed',
                'mob_experience',
                'post_attack',
                'post_piercing_attack',
                'prevent_armor_change',
                'prevent_equipment_drop',
                'projectile_count',
                'projectile_piercing',
                'projectile_spawned',
                'projectile_spread',
                'repair_with_xp',
                'smash_damage_per_fallen_block',
                'tick',
                'trident_return_acceleration',
                'trident_sound',
                'trident_spin_attack_strength'
            ].toSorted()
        );
    });

    it('parses a body for every one of the 31', () => {
        for (const component of EFFECT_COMPONENT_TYPES) {
            const parsed = parseOne(component, BODIES[component]);
            expect(parsed?.kind).toBe(EFFECT_COMPONENTS[component].kind);
        }
    });

    it('gives the nine damage context components the enchanted_damage key set', () => {
        const damageContext = EFFECT_COMPONENT_TYPES.filter(
            (component) => EFFECT_COMPONENTS[component].parameterSet === 'enchanted_damage'
        );

        expect(damageContext.toSorted()).toEqual([
            'armor_effectiveness',
            'damage',
            'damage_immunity',
            'damage_protection',
            'equipment_drops',
            'knockback',
            'post_attack',
            'post_piercing_attack',
            'smash_damage_per_fallen_block'
        ]);
    });

    it('gives the five item context components the enchanted_item key set', () => {
        const itemContext = EFFECT_COMPONENT_TYPES.filter(
            (component) => EFFECT_COMPONENTS[component].parameterSet === 'enchanted_item'
        );

        expect(itemContext.toSorted()).toEqual([
            'ammo_use',
            'block_experience',
            'item_damage',
            'projectile_piercing',
            'repair_with_xp'
        ]);
    });

    it('leaves the seven unconditional components without a key set', () => {
        const noContext = EFFECT_COMPONENT_TYPES.filter(
            (component) => EFFECT_COMPONENTS[component].parameterSet === undefined
        );

        expect(noContext.toSorted()).toEqual([
            'attributes',
            'crossbow_charge_time',
            'crossbow_charging_sounds',
            'prevent_armor_change',
            'prevent_equipment_drop',
            'trident_sound',
            'trident_spin_attack_strength'
        ]);
    });
});

describe('component bodies', () => {
    it('keeps the targets of a post_attack entry', () => {
        const parsed = parseOne('post_attack', BODIES.post_attack);
        expect(parsed?.kind === 'targeted_entity_effect' && parsed.entries[0]).toMatchObject({
            affected: 'attacker',
            enchanted: 'victim'
        });
    });

    it('keeps the enchanted target of an equipment_drops entry', () => {
        const parsed = parseOne('equipment_drops', BODIES.equipment_drops);
        expect(parsed?.kind === 'targeted_value' && parsed.entries[0]?.enchanted).toBe('attacker');
    });

    it('reads a damage_immunity entry as a condition with no body', () => {
        const parsed = parseOne('damage_immunity', BODIES.damage_immunity);
        expect(parsed?.kind === 'conditional_marker' && parsed.entries).toHaveLength(1);
        expect(parsed?.kind === 'conditional_marker' && parsed.entries[0]?.requirements).toBeTypeOf('function');
    });

    it('reads crossbow charging sounds one bank per level', () => {
        const parsed = parseOne('crossbow_charging_sounds', BODIES.crossbow_charging_sounds);
        expect(parsed?.kind === 'charging_sounds' && parsed.perLevel).toEqual([
            {
                start: 'minecraft:item.crossbow.quick_charge_1',
                mid: undefined,
                end: 'minecraft:item.crossbow.loading_end'
            }
        ]);
    });

    it('reads a trident sound list one sound per level', () => {
        const parsed = parseOne('trident_sound', ['minecraft:item.trident.riptide_1', 'item.trident.riptide_2']);
        expect(parsed?.kind === 'sound_list' && parsed.perLevel).toEqual([
            'minecraft:item.trident.riptide_1',
            'minecraft:item.trident.riptide_2'
        ]);
    });

    it('reads a marker as presence alone', () => {
        expect(parseOne('prevent_armor_change', {})?.kind).toBe('marker');
    });

    it('warns when a marker is given fields', () => {
        const { diagnostics } = parseEffects({ 'minecraft:prevent_armor_change': { level: 2 } });
        expect(diagnostics.map((entry) => `${entry.severity}: ${entry.message}`)).toEqual([
            'warning: prevent_armor_change takes no fields and ignores the ones given'
        ]);
    });
});

describe('a malformed effects map', () => {
    it('reports an unknown component and keeps the known ones', () => {
        const { value, diagnostics } = parseEffects({
            'minecraft:damage': BODIES.damage,
            'minecraft:double_jump': []
        });

        expect(diagnostics.map((entry) => entry.message)).toEqual([
            'unknown enchantment effect component minecraft:double_jump'
        ]);
        expect([...value.keys()]).toEqual(['damage']);
    });

    it('reports an effects map that is not an object', () => {
        const { diagnostics } = parseEffects([]);
        expect(diagnostics.map((entry) => entry.message)).toEqual(['effects must be a map of component type to body']);
    });
});
