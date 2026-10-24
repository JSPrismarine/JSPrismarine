import { PredicateContext } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import { ENTITY_EFFECT_TYPES, LOCATION_EFFECT_TYPES, parseEffect } from './effects';
import type { EffectScope, ResolvedEffect } from './effects';

const run = (json: unknown, level = 1, scope: EffectScope = 'location'): readonly ResolvedEffect[] => {
    const { value, diagnostics } = parseEffect(json, scope);
    expect(diagnostics).toEqual([]);

    const emitted: ResolvedEffect[] = [];
    value(level, new PredicateContext(), (effect) => emitted.push(effect));
    return emitted;
};

const only = (json: unknown, level = 1): ResolvedEffect => {
    const emitted = run(json, level);
    expect(emitted).toHaveLength(1);
    return emitted[0] as ResolvedEffect;
};

describe('the effect type registries', () => {
    it('registers the 15 entity effect types of 26.3', () => {
        expect(ENTITY_EFFECT_TYPES).toHaveLength(15);
        expect([...ENTITY_EFFECT_TYPES]).toEqual([...ENTITY_EFFECT_TYPES].toSorted());
    });

    it('registers the 16 location effect types, which are the entity types plus attribute', () => {
        expect(LOCATION_EFFECT_TYPES).toHaveLength(16);
        expect([...LOCATION_EFFECT_TYPES].filter((name) => !ENTITY_EFFECT_TYPES.includes(name))).toEqual(['attribute']);
    });

    it('rejects attribute inside an entity effect component', () => {
        const { diagnostics } = parseEffect({ type: 'minecraft:attribute' }, 'entity');
        expect(diagnostics.map((entry) => entry.message)).toEqual(['unknown entity effect type minecraft:attribute']);
    });
});

describe('the 16 location based effect types', () => {
    it('reads apply_exhaustion', () => {
        // lunge.json: 4 exhaustion per level.
        const effect = only(
            {
                type: 'minecraft:apply_exhaustion',
                amount: { type: 'minecraft:linear', base: 4, per_level_above_first: 4 }
            },
            2
        );
        expect(effect).toEqual({ type: 'apply_exhaustion', amount: 8 });
    });

    it('reads apply_impulse', () => {
        // lunge.json: forward impulse with the vertical component scaled away.
        const effect = only({
            type: 'minecraft:apply_impulse',
            coordinate_scale: [1, 0, 1],
            direction: [0, 0, 1],
            magnitude: { type: 'minecraft:linear', base: 0.458, per_level_above_first: 0.458 }
        });
        expect(effect).toEqual({
            type: 'apply_impulse',
            coordinateScale: [1, 0, 1],
            direction: [0, 0, 1],
            magnitude: 0.458
        });
    });

    it('reads apply_mob_effect and keeps its durations in seconds', () => {
        const effect = only(
            {
                type: 'minecraft:apply_mob_effect',
                to_apply: 'minecraft:slowness',
                min_duration: 1.5,
                max_duration: { type: 'minecraft:linear', base: 1.5, per_level_above_first: 0.5 },
                min_amplifier: 3,
                max_amplifier: 3
            },
            3
        );

        expect(effect).toMatchObject({
            type: 'apply_mob_effect',
            minDuration: 1.5,
            maxDuration: 2.5,
            minAmplifier: 3,
            maxAmplifier: 3
        });
        expect(effect.type === 'apply_mob_effect' && [...effect.toApply.ids]).toEqual(['minecraft:slowness']);
    });

    it('reads change_item_damage', () => {
        expect(only({ type: 'minecraft:change_item_damage', amount: 2 })).toEqual({
            type: 'change_item_damage',
            amount: 2
        });
    });

    it('reads damage_entity', () => {
        // thorns.json.
        expect(
            only({ type: 'minecraft:damage_entity', damage_type: 'minecraft:thorns', max_damage: 5, min_damage: 1 })
        ).toEqual({ type: 'damage_entity', damageType: 'minecraft:thorns', minDamage: 1, maxDamage: 5 });
    });

    it('reads explode and resolves the level based knockback', () => {
        // wind_burst.json at level 2.
        const effect = only(
            {
                type: 'minecraft:explode',
                block_interaction: 'trigger',
                immune_blocks: '#minecraft:blocks_wind_charge_explosions',
                knockback_multiplier: {
                    type: 'minecraft:lookup',
                    fallback: { type: 'minecraft:linear', base: 1.5, per_level_above_first: 0.35 },
                    values: [1.2, 1.75, 2.2]
                },
                large_particle: { type: 'minecraft:gust_emitter_large' },
                radius: 3.5,
                small_particle: { type: 'minecraft:gust_emitter_small' },
                sound: 'minecraft:entity.wind_charge.wind_burst'
            },
            2
        );

        expect(effect).toMatchObject({
            type: 'explode',
            blockInteraction: 'trigger',
            knockbackMultiplier: 1.75,
            radius: 3.5,
            createFire: false,
            attributeToUser: false,
            offset: [0, 0, 0],
            sound: 'minecraft:entity.wind_charge.wind_burst'
        });
        expect(effect.type === 'explode' && effect.immuneBlocks?.tags).toEqual([
            'minecraft:blocks_wind_charge_explosions'
        ]);
    });

    it('reads ignite', () => {
        // fire_aspect.json: 4 seconds per level.
        expect(
            only(
                {
                    type: 'minecraft:ignite',
                    duration: { type: 'minecraft:linear', base: 4, per_level_above_first: 4 }
                },
                2
            )
        ).toEqual({ type: 'ignite', duration: 8 });
    });

    it('reads play_sound and resolves its float providers', () => {
        // channeling.json.
        expect(
            only({ type: 'minecraft:play_sound', pitch: 1, sound: 'minecraft:item.trident.thunder', volume: 5 })
        ).toEqual({ type: 'play_sound', sounds: ['minecraft:item.trident.thunder'], pitch: 1, volume: 5 });
    });

    it('reads a play_sound that lists several sounds', () => {
        // lunge.json picks one of three.
        const effect = only({
            type: 'minecraft:play_sound',
            pitch: 1,
            sound: ['minecraft:item.spear.lunge_1', 'minecraft:item.spear.lunge_2'],
            volume: 1
        });
        expect(effect.type === 'play_sound' && effect.sounds).toEqual([
            'minecraft:item.spear.lunge_1',
            'minecraft:item.spear.lunge_2'
        ]);
    });

    it('reads replace_block', () => {
        expect(
            only({
                type: 'minecraft:replace_block',
                offset: [0, -1, 0],
                block_state: { id: 'minecraft:frosted_ice' },
                trigger_game_event: 'minecraft:block_place'
            })
        ).toEqual({
            type: 'replace_block',
            offset: [0, -1, 0],
            predicate: undefined,
            blockState: { id: 'minecraft:frosted_ice' },
            triggerGameEvent: 'minecraft:block_place'
        });
    });

    it('reads replace_disk', () => {
        // frost_walker.json at level 2: a clamped linear radius of 4.
        const effect = only(
            {
                type: 'minecraft:replace_disk',
                block_state: { id: 'minecraft:frosted_ice', properties: { age: '0' } },
                height: 1,
                offset: [0, -1, 0],
                radius: {
                    type: 'minecraft:clamped',
                    max: 16,
                    min: 0,
                    value: { type: 'minecraft:linear', base: 3, per_level_above_first: 1 }
                },
                trigger_game_event: 'minecraft:block_place'
            },
            2
        );

        expect(effect).toMatchObject({ type: 'replace_disk', radius: 4, height: 1, offset: [0, -1, 0] });
    });

    it('reads run_function', () => {
        expect(only({ type: 'minecraft:run_function', function: 'example:on_tick' })).toEqual({
            type: 'run_function',
            function: 'example:on_tick'
        });
    });

    it('reads set_block_properties', () => {
        expect(
            only({ type: 'minecraft:set_block_properties', properties: { lit: 'true' }, offset: [0, 1, 0] })
        ).toEqual({
            type: 'set_block_properties',
            properties: { lit: 'true' },
            offset: [0, 1, 0],
            triggerGameEvent: undefined
        });
    });

    it('reads spawn_particles', () => {
        // soul_speed.json.
        const effect = only({
            type: 'minecraft:spawn_particles',
            horizontal_position: { type: 'in_bounding_box' },
            horizontal_velocity: { movement_scale: -0.2 },
            particle: { type: 'minecraft:soul' },
            speed: 1.0,
            vertical_position: { type: 'entity_position', offset: 0.1 },
            vertical_velocity: { base: 0.1 }
        });

        expect(effect).toMatchObject({
            type: 'spawn_particles',
            particle: { type: 'minecraft:soul' },
            speed: 1,
            horizontalPosition: { type: 'in_bounding_box' },
            verticalPosition: { type: 'entity_position', offset: 0.1 }
        });
    });

    it('reads summon_entity', () => {
        // channeling.json.
        const effect = only({ type: 'minecraft:summon_entity', entity: 'minecraft:lightning_bolt' });
        expect(effect).toMatchObject({ type: 'summon_entity', joinTeam: false });
        expect(effect.type === 'summon_entity' && [...effect.entityTypes.ids]).toEqual(['minecraft:lightning_bolt']);
    });

    it('reads attribute, which only a location based component may hold', () => {
        // soul_speed.json.
        expect(
            only(
                {
                    type: 'minecraft:attribute',
                    amount: { type: 'minecraft:linear', base: 0.0405, per_level_above_first: 0.0105 },
                    attribute: 'minecraft:movement_speed',
                    id: 'minecraft:enchantment.soul_speed',
                    operation: 'add_value'
                },
                1
            )
        ).toEqual({
            type: 'attribute',
            amount: 0.0405,
            attribute: 'minecraft:movement_speed',
            id: 'minecraft:enchantment.soul_speed',
            operation: 'add_value'
        });
    });

    it('flattens all_of into its members, in order', () => {
        // soul_speed.json applies two attribute modifiers from one all_of.
        const emitted = run({
            type: 'minecraft:all_of',
            effects: [
                {
                    type: 'minecraft:attribute',
                    amount: 1,
                    attribute: 'minecraft:movement_efficiency',
                    id: 'minecraft:enchantment.soul_speed',
                    operation: 'add_value'
                },
                { type: 'minecraft:change_item_damage', amount: 1 }
            ]
        });

        expect(emitted.map((effect) => effect.type)).toEqual(['attribute', 'change_item_damage']);
    });
});

describe('a malformed effect', () => {
    it('reports an unknown type and emits nothing', () => {
        const { value, diagnostics } = parseEffect({ type: 'minecraft:teleport' }, 'entity');
        expect(diagnostics.map((entry) => entry.message)).toEqual(['unknown entity effect type minecraft:teleport']);

        const emitted: ResolvedEffect[] = [];
        value(1, new PredicateContext(), (effect) => emitted.push(effect));
        expect(emitted).toEqual([]);
    });

    it('reports a missing type', () => {
        const { diagnostics } = parseEffect({}, 'location');
        expect(diagnostics.map((entry) => entry.message)).toEqual(['a location effect needs a type']);
    });
});
