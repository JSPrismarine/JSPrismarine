import type { BindContext } from '@jsprismarine/content';
import { describe, expect, it } from 'vitest';

import {
    BLOCK_COMPONENTS,
    BLOCK_COMPONENT_NAMES,
    createBlockComponentRegistry,
    destructibleByMining,
    entityFallOn,
    flammable,
    friction,
    geometryComponent,
    lightEmission,
    liquidDetection,
    mapColor,
    materialInstancesComponent,
    redstoneConsumer,
    tick
} from './components';

const context: BindContext = {
    identifier: 'test:thing',
    definition: { identifier: 'test:thing', registry: 'blocks', pack: 'test', path: 'blocks/t.json', data: {} }
};

const parse = (factory: { schema: (value: unknown) => { ok: boolean } }, value: unknown) => factory.schema(value);

describe('the block component registry', () => {
    it('registers every component exactly once', () => {
        const registry = createBlockComponentRegistry();

        expect(registry.names()).toEqual(BLOCK_COMPONENT_NAMES);
        expect(new Set(BLOCK_COMPONENT_NAMES).size).toBe(BLOCK_COMPONENT_NAMES.length);
    });

    it('covers the 49 names in Mojang 1.26.20 Components.json plus the four renamed ones', () => {
        const mojang = BLOCK_COMPONENT_NAMES.filter((name) => name.startsWith('minecraft:'));

        expect(mojang).toHaveLength(54);
        expect(BLOCK_COMPONENT_NAMES.filter((name) => name.startsWith('jsprismarine:'))).toEqual([
            'jsprismarine:behavior',
            'jsprismarine:block_properties',
            'jsprismarine:container_open_sound'
        ]);
    });

    it('binds no handler, because components carry parameters and behaviors carry code', () => {
        const registry = createBlockComponentRegistry();
        const bound = registry.bind('minecraft:tick', { interval_range: [10, 20] }, context);

        expect(bound.ok).toBe(true);
        expect(bound.ok && bound.value.handlers).toEqual({});
    });

    it('declares the hooks a component lets a block reach', () => {
        const registry = createBlockComponentRegistry();

        expect([...registry.hooksOf('minecraft:tick')]).toEqual(['onTick']);
        expect([...registry.hooksOf('minecraft:entity_fall_on')]).toEqual(['onEntityFallOn']);
        expect([...registry.hooksOf('minecraft:redstone_consumer')]).toEqual(['onRedstoneUpdate']);
        expect([...registry.hooksOf('minecraft:random_ticking')]).toEqual(['onRandomTick']);
        expect([...registry.hooksOf('minecraft:friction')]).toEqual([]);
    });

    it('reports an unknown component name instead of throwing', () => {
        const registry = createBlockComponentRegistry();
        const bound = registry.bind('minecraft:not_a_component', {}, context);

        expect(bound).toEqual({ ok: false, message: 'no component is registered as minecraft:not_a_component' });
    });

    it('gives every factory a name in a namespace', () => {
        for (const component of BLOCK_COMPONENTS) expect(component.name).toMatch(/^[a-z_]+:[a-z_]+$/);
    });
});

describe('component parameter parsing', () => {
    it('reads destructible_by_mining in both of its forms', () => {
        expect(destructibleByMining.schema({ seconds_to_destroy: 1.8 })).toEqual({
            ok: true,
            value: { secondsToDestroy: 1.8, itemSpecificSpeeds: [] }
        });
        expect(destructibleByMining.schema(false)).toEqual({ ok: true, value: false });
    });

    it('fills an absent field with the default Mojang documents', () => {
        expect(flammable.schema({})).toEqual({
            ok: true,
            value: { catchChanceModifier: 5, destroyChanceModifier: 20, lavaFlammable: 'never' }
        });
    });

    it('holds friction to the 0 to 0.9 range Mojang declares', () => {
        expect(friction.schema(0.6)).toEqual({ ok: true, value: 0.6 });
        expect(parse(friction, 0.989).ok).toBe(false);
    });

    it('holds light emission to whole numbers in 0 to 15', () => {
        expect(lightEmission.schema(15)).toEqual({ ok: true, value: 15 });
        expect(parse(lightEmission, 16).ok).toBe(false);
        expect(parse(lightEmission, 7.5).ok).toBe(false);
    });

    it('reads a map color as a hex string and rejects a name', () => {
        expect(mapColor.schema('#191919')).toEqual({ ok: true, value: '#191919' });
        expect(parse(mapColor, 'gray').ok).toBe(false);
    });

    it('reads geometry as a bare name or as the detailed object', () => {
        expect(geometryComponent.schema('minecraft:geometry.cross')).toEqual({
            ok: true,
            value: 'minecraft:geometry.cross'
        });

        const detailed = geometryComponent.schema({
            identifier: 'minecraft:geometry.shelf_mushroom_small',
            culling: 'minecraft:culling.shelf_mushroom_small'
        });
        expect(detailed.ok && detailed.value).toMatchObject({
            identifier: 'minecraft:geometry.shelf_mushroom_small',
            culling: 'minecraft:culling.shelf_mushroom_small',
            uvLock: false
        });
    });

    it('reads material instances keyed by face with the render defaults', () => {
        const parsed = materialInstancesComponent.schema({
            '*': { texture: 'red_shrub', render_method: 'alpha_test_single_sided', ambient_occlusion: 0 }
        });

        expect(parsed.ok && parsed.value).toEqual({
            '*': {
                texture: 'red_shrub',
                renderMethod: 'alpha_test_single_sided',
                ambientOcclusion: 0,
                faceDimming: true,
                isotropic: false,
                alphaMaskedTint: false,
                tintMethod: 'none'
            }
        });
    });

    it('takes exactly one liquid detection rule', () => {
        const parsed = liquidDetection.schema({
            detection_rules: [{ liquid_type: 'water', can_contain_liquid: true, on_liquid_touches: 'blocking' }]
        });

        expect(parsed.ok && parsed.value.detectionRules[0]).toEqual({
            liquidType: 'water',
            canContainLiquid: true,
            onLiquidTouches: 'blocking',
            stopsLiquidFlowingFromDirection: [],
            useLiquidClipping: false
        });
        expect(parse(liquidDetection, { detection_rules: [] }).ok).toBe(false);
    });

    it('takes a tick interval of exactly two values', () => {
        expect(tick.schema({ interval_range: [10, 20] })).toEqual({
            ok: true,
            value: { intervalRange: [10, 20], looping: true }
        });
        expect(parse(tick, { interval_range: [10] }).ok).toBe(false);
    });

    it('names the field that failed', () => {
        const parsed = entityFallOn.schema({ min_fall_distance: 'far' });

        expect(parsed).toEqual({ ok: false, message: 'min_fall_distance: expected a number' });
    });

    it('fills every optional field of an empty object with its default', () => {
        expect(redstoneConsumer.schema({})).toEqual({ ok: true, value: { minPower: 1, propagatesPower: false } });
    });
});
