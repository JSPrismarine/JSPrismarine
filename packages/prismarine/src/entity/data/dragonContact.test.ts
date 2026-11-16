import { dragonPhaseState } from '@jsprismarine/entity-goals/goals/dragonPhases';
import type { DragonPhaseName } from '@jsprismarine/entity-goals/goals/dragonPhases';
import { describe, expect, it } from 'vitest';

import { DEFLECTED_ARROW_FIRE_TICKS } from './dragonArrows';
import { breathSearchBox, dragonBreathOf } from './dragonFireball';
import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

const GROUND = FLOOR_Y + 1;

/** A big target with a dragon's phase state, and arrows and fireballs that fly into it. */
const ENTITIES = {
    'jsprismarine:perch': {
        components: {
            'minecraft:health': { value: 200, max: 200 },
            'minecraft:collision_box': { width: 4, height: 4 }
        }
    },
    'minecraft:arrow': {
        components: {
            'minecraft:collision_box': { width: 0.25, height: 0.25 },
            'minecraft:projectile': { on_hit: { impact_damage: { damage: 6 }, remove_on_hit: {} } }
        }
    },
    'minecraft:dragon_fireball': {
        components: {
            'minecraft:collision_box': { width: 0.31, height: 0.31 },
            'minecraft:projectile': { gravity: 0, on_hit: { remove_on_hit: {} } }
        }
    },
    'minecraft:area_effect_cloud': { components: {} }
};

/** An arrow from a player flying east into a target in one dragon phase. */
const shootAt = (phase: DragonPhaseName) => {
    const world = new TestEntityWorld({
        players: [{ id: 900, identifier: 'minecraft:player', position: { x: -20, y: GROUND, z: 0.5 } }]
    });
    const { runtime } = entityFixture(world, {}, ENTITIES);
    const perch = runtime.spawn('jsprismarine:perch', { x: 0.5, y: GROUND, z: 0.5 });
    const arrow = runtime.spawn('minecraft:arrow', { x: -6, y: GROUND + 1, z: 0.5 }, { ownerId: 900 });
    if (perch === undefined || arrow === undefined) throw new Error('the fixture spawned nothing');
    perch.instance.componentState.set(dragonPhaseState, { phase, flameCount: 0, chargeTarget: null });
    arrow.body.velocity = { x: 2, y: 0, z: 0 };
    for (let tick = 1; tick <= 4; tick += 1) runtime.tick(tick);
    return { perch, arrow };
};

describe('an arrow against an ender dragon', () => {
    it('comes off a perched dragon burning and turned back, dealing nothing', () => {
        const { perch, arrow } = shootAt('sitting_scanning');

        expect(perch.instance.attributes.get('health')?.current).toBe(200);
        expect(arrow.removed).toBeUndefined();
        expect(arrow.body.fireTicks).toBeGreaterThan(DEFLECTED_ARROW_FIRE_TICKS - 5);
        expect(arrow.body.velocity.x).toBeLessThan(0);
    });

    it('hits a dragon in flight as it hits anything', () => {
        const { arrow } = shootAt('holding_pattern');

        expect(arrow.removed).toBeDefined();
    });
});

describe("a dragon fireball's breath", () => {
    it('forms on the first living thing within 4 blocks of where the fireball landed', () => {
        const at = { x: 0, y: 64, z: 0 };
        const breath = dragonBreathOf(at, [{ position: { x: 5, y: 64, z: 0 } }, { position: { x: 2, y: 64, z: 1 } }]);

        expect(breath.at).toEqual({ x: 2, y: 64, z: 1 });
        expect(breath.data).toMatchObject({ radius: 3, duration: 600, potion_duration_scale: 0.25 });
        expect(dragonBreathOf(at, []).at).toEqual(at);
        expect(breathSearchBox(at, 0.5)).toEqual({
            min: { x: -4.5, y: -2.5 + 64, z: -4.5 },
            max: { x: 4.5, y: 66.5, z: 4.5 }
        });
    });

    it('is left where a fireball lands, owned by whoever shot it', () => {
        const world = new TestEntityWorld();
        const { runtime } = entityFixture(world, {}, ENTITIES);
        const shooter = runtime.spawn('jsprismarine:perch', { x: 20.5, y: GROUND, z: 0.5 });
        const fireball = runtime.spawn(
            'minecraft:dragon_fireball',
            { x: 0.5, y: GROUND + 2, z: 0.5 },
            shooter === undefined ? {} : { ownerId: shooter.id }
        );
        if (fireball === undefined) throw new Error('the fixture spawned no fireball');
        fireball.body.velocity = { x: 0, y: -0.5, z: 0 };
        for (let tick = 1; tick <= 10 && fireball.removed === undefined; tick += 1) runtime.tick(tick);

        const clouds = [...runtime.entities()].filter((entity) => entity.identifier === 'minecraft:area_effect_cloud');
        expect(clouds).toHaveLength(1);
        expect(clouds[0]?.body.owner).toBe(shooter?.id);
    });
});
