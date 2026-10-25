import { BehaviorRegistry } from '@jsprismarine/content';
import type { ItemHooks } from '@jsprismarine/items';
import { itemTypesTable, ItemStack as Stack, loadItemTypes } from '@jsprismarine/items';
import { describe, expect, it } from 'vitest';

import { maceDamageBonus, kineticDamageOf, shieldDurabilityCost } from './behaviors/combat';
import { BUCKET_CONTENTS, BUCKET_PICKUPS } from './behaviors/fluids';
import { clockReading, compassTargetOf, LODESTONE_TRACKER } from './behaviors/navigation';
import { bowPowerForTime, crossbowChargeTicks, THROWN_PROJECTILES } from './behaviors/projectiles';
import { applyDeathProtection, deathProtectionOf, elytraDurabilityTick } from './behaviors/wearable';
import { ITEM_FAMILIES } from './families';
import { attackDamage, attackStrengthScale, breakTicks, destroyProgress, miningSpeed } from './formulas';
import { deferredItemFactory } from './items';
import {
    COMPONENT_DRIVEN_BEHAVIORS,
    registerVanillaItemBehaviors,
    selectorFor,
    VANILLA_ITEM_BEHAVIORS
} from './registry';
import { createTestWorld, testSource } from './testing';

const behaviorNames = VANILLA_ITEM_BEHAVIORS.map((spec) => spec.name);
const namedInFamilies = new Set(ITEM_FAMILIES.flatMap((family) => [...family.behaviors]));

describe('the behavior catalog', () => {
    it('registers each name once', () => {
        expect(new Set(behaviorNames).size).toBe(behaviorNames.length);
    });

    it('names every behavior in the vanilla namespace', () => {
        for (const name of behaviorNames) expect(name.startsWith('vanilla:'), name).toBe(true);
    });

    it('declares a hook for every behavior, since a behavior with none is an entry point', () => {
        for (const spec of VANILLA_ITEM_BEHAVIORS) expect(spec.hooks.length, spec.name).toBeGreaterThan(0);
    });

    it('matches the family catalog in both directions', () => {
        expect([...namedInFamilies].sort()).toEqual([...behaviorNames].sort());
    });

    it('attaches the specialized families before the general ones they build on', () => {
        const order = (name: string): number => behaviorNames.indexOf(name);
        // `dispatchFirst` stops at the first handler that returns a value, so
        // anything that only performs effects has to run first.
        expect(order('vanilla:potion')).toBeLessThan(order('vanilla:consumable'));
        expect(order('vanilla:suspicious_stew')).toBeLessThan(order('vanilla:consumable'));
        expect(order('vanilla:ominous_bottle')).toBeLessThan(order('vanilla:consumable'));
        expect(order('vanilla:mace')).toBeLessThan(order('vanilla:melee_weapon'));
        expect(order('vanilla:trident')).toBeLessThan(order('vanilla:melee_weapon'));
        expect(order('vanilla:block_transformer')).toBeLessThan(order('vanilla:mining_tool'));
        expect(order('vanilla:shears')).toBeLessThan(order('vanilla:mining_tool'));
        expect(order('vanilla:shield')).toBeLessThan(order('vanilla:equippable'));
    });

    it('exports exactly the functions the families list as server entry points', () => {
        // Each value is the real export, so the catalog cannot name one that
        // does not exist and an export cannot stop being documented.
        const entryPoints: Readonly<Record<string, unknown>> = {
            applyDeathProtection,
            attackDamage,
            attackStrengthScale,
            bowPowerForTime,
            breakTicks,
            clockReading,
            compassTargetOf,
            crossbowChargeTicks,
            deathProtectionOf,
            destroyProgress,
            elytraDurabilityTick,
            kineticDamageOf,
            maceDamageBonus,
            miningSpeed,
            shieldDurabilityCost
        };

        const named = new Set(ITEM_FAMILIES.flatMap((family) => ('entryPoints' in family ? family.entryPoints : [])));
        expect([...named].sort()).toEqual(Object.keys(entryPoints).sort());
        for (const [name, value] of Object.entries(entryPoints)) expect(typeof value, name).toBe('function');
    });
});

describe('selectors', () => {
    it('gives a component-driven behavior the whole registry', () => {
        const selector = selectorFor('vanilla:consumable');
        expect(typeof selector).toBe('function');
    });

    it('gives a name-driven behavior a list that is neither empty nor the whole table', () => {
        for (const name of behaviorNames) {
            if (COMPONENT_DRIVEN_BEHAVIORS.has(name)) continue;
            const selector = selectorFor(name);
            expect(Array.isArray(selector), name).toBe(true);
            const identifiers = Array.isArray(selector) ? selector : [];
            expect(identifiers.length, name).toBeGreaterThan(0);
            expect(identifiers.length, name).toBeLessThan(Object.keys(itemTypesTable.items).length);
        }
    });

    it('resolves the identifiers the engine families expect', () => {
        expect(selectorFor('vanilla:bow')).toEqual(['minecraft:bow']);
        expect(selectorFor('vanilla:map')).toEqual(['minecraft:empty_map', 'minecraft:filled_map']);
        expect(selectorFor('vanilla:bucket')).toEqual(
            expect.arrayContaining([
                'minecraft:bucket',
                'minecraft:water_bucket',
                'minecraft:lava_bucket',
                'minecraft:powder_snow_bucket'
            ])
        );
    });
});

describe('the identifier tables inside the behaviors', () => {
    const known = new Set(Object.keys(itemTypesTable.items));

    it('keys every throwable on an item the Bedrock table has', () => {
        for (const identifier of Object.keys(THROWN_PROJECTILES)) expect(known.has(identifier), identifier).toBe(true);
    });

    it('keys every bucket on an item the Bedrock table has', () => {
        for (const identifier of Object.keys(BUCKET_CONTENTS)) expect(known.has(identifier), identifier).toBe(true);
    });

    it('names a bucket for every block an empty bucket picks up', () => {
        for (const pickup of Object.values(BUCKET_PICKUPS)) expect(known.has(pickup.item), pickup.item).toBe(true);
    });
});

describe('registerVanillaItemBehaviors', () => {
    it('registers and attaches every behavior in one call', () => {
        const registry = new BehaviorRegistry<ItemHooks>();
        registerVanillaItemBehaviors(registry, { world: createTestWorld(), items: deferredItemFactory() });

        expect(registry.names()).toEqual(behaviorNames);
        for (const name of behaviorNames) expect(registry.has(name)).toBe(true);
    });

    it('refuses to run twice against the same registry', () => {
        const registry = new BehaviorRegistry<ItemHooks>();
        const environment = { world: createTestWorld(), items: deferredItemFactory() };
        registerVanillaItemBehaviors(registry, environment);
        expect(() => registerVanillaItemBehaviors(registry, environment)).toThrow(/already registered/);
    });
});

describe('the server entry points', () => {
    const world = createTestWorld();
    const items = deferredItemFactory();
    const behaviors = new BehaviorRegistry<ItemHooks>();
    registerVanillaItemBehaviors(behaviors, { world, items });
    const { registry } = loadItemTypes({ behaviors, strict: true });
    items.bind(registry);

    const source = testSource();
    const stackOf = (identifier: string, count = 1) => new Stack(registry.holder(identifier), count);

    it('runs a totem save from the damage path', () => {
        const totem = stackOf('minecraft:totem_of_undying', 2);
        const left = applyDeathProtection(world, totem, source);

        expect(world.performed('remove-effects')).toHaveLength(1);
        expect(world.performed('apply-effects')[0]?.effects.map((effect) => effect.id)).toEqual([
            'minecraft:regeneration',
            'minecraft:absorption',
            'minecraft:fire_resistance'
        ]);
        expect(left.count).toBe(1);
    });

    it('wears an elytra out once a second of gliding', () => {
        const gliding = createTestWorld();
        const elytra = stackOf('minecraft:elytra');

        expect(elytraDurabilityTick(gliding, elytra, source, 5).get('minecraft:damage')).toBe(0);
        expect(elytraDurabilityTick(gliding, elytra, source, 20).get('minecraft:damage')).toBe(1);
        expect(gliding.performed('consume-durability')).toHaveLength(1);
    });

    it('costs a shield durability only above its threshold', () => {
        const shield = stackOf('minecraft:shield');
        expect(shieldDurabilityCost(shield, 2)).toBe(0);
        expect(shieldDurabilityCost(shield, 3)).toBe(4);
        expect(shieldDurabilityCost(stackOf('minecraft:apple'), 10)).toBe(0);
    });

    it('points a compass at the spawn, at a lodestone, or at a death', () => {
        const spawn = { x: 8, y: 64, z: 8 };
        const death = { x: -40, y: 12, z: 99 };

        expect(compassTargetOf(stackOf('minecraft:compass'), spawn, death)).toEqual(spawn);
        expect(compassTargetOf(stackOf('minecraft:recovery_compass'), spawn, death)).toEqual(death);
        expect(compassTargetOf(stackOf('minecraft:recovery_compass'), spawn, undefined)).toBeUndefined();

        const bound = stackOf('minecraft:compass');
        bound.set(LODESTONE_TRACKER, { target: { pos: [1, 2, 3] }, tracked: true });
        expect(compassTargetOf(bound, spawn, death)).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('reads a clock from noon round to noon', () => {
        expect(clockReading(6000)).toBeCloseTo(0, 6);
        expect(clockReading(18000)).toBeCloseTo(0.5, 6);
        expect(clockReading(0)).toBeCloseTo(0.75, 6);
    });
});
