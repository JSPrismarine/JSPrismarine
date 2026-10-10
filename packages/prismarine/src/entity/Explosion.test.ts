import { beforeEach, describe, expect, it } from 'vitest';

import { Difficulty, LevelEvent } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { GameRules } from '../world/GameRuleManager';
import { Position } from '../world/Position';
import { DamageCause } from './DamageCause';
import type { Entity } from './Entity';
import { explode } from './Explosion';
import Cow from './passive/Cow';
import Creeper from './hostile/Creeper';
import IronGolem from './neutral/IronGolem';

/**
 * Blasts.
 *
 * The curve is vanilla's: a creeper at point blank kills an unarmoured player outright and one at
 * four blocks costs a couple of half-hearts. That steepness is the mob, so it is what is checked.
 */
const scene = ({ griefing = true, solid = false } = {}) => {
    const nearby: Entity[] = [];
    const effects: LevelEvent[] = [];
    const cleared: string[] = [];

    const world: any = {
        getName: () => 'test',
        getServer: () => ({
            post: () => {},
            getTick: () => 0,
            getRandom: () => () => 0.5,
            getConfig: () => ({ getDifficulty: () => Difficulty.NORMAL })
        }),
        sendActorEvent: async () => {},
        sendActorSound: async () => {},
        sendActorMetadata: async () => {},
        sendWorldEvent: async (_at: unknown, event: LevelEvent) => void effects.push(event),
        broadcastMove: async () => {},
        getGameRuleManager: () => ({
            getGameRule: (name: string) => [name === GameRules.MobGriefing ? griefing : true, true]
        }),
        getEntityGrid: () => ({ near: () => nearby }),
        getBlockState: async () => ({ name: solid ? 'minecraft:stone' : 'minecraft:air' }),
        setBlockByName: async (x: number, y: number, z: number) => void cleared.push(`${x},${y},${z}`),
        getLoadedChunk: () => null
    };

    const spawn = <T extends Entity>(Species: new (options: any) => T, x = 0, z = 0): T => {
        const entity = new Species({ position: new Position(x, 64, z, world) });
        nearby.push(entity);
        return entity;
    };

    return { world, spawn, effects, cleared };
};

/**
 * How much health something this far from a power-3 blast loses.
 *
 * An iron golem rather than a cow, because a cow has ten half-hearts and a creeper is lethal to it
 * out to three blocks - every reading inside that range would come back as "all of it" and the
 * curve would be invisible. A hundred health leaves room to see the shape.
 */
const blastAt = async (distance: number): Promise<number> => {
    const stage = scene();
    const golem = stage.spawn(IronGolem, distance, 0);

    // Nothing in the way: the world's `getLoadedChunk` is null, so the sight check finds no walls.
    await explode(stage.world, new Vector3(0, 64, 0), { power: 3, breaksBlocks: false });

    return 100 - golem.getHealth();
};

describe('explosions', () => {
    let stage: ReturnType<typeof scene>;

    beforeEach(() => {
        stage = scene();
    });

    it('kills anything standing on top of it', async () => {
        const cow = stage.spawn(Cow, 0, 0);
        await explode(stage.world, new Vector3(0, 64, 0), { power: 3, breaksBlocks: false });

        expect(cow.isAlive()).toBe(false);
    });

    it('falls away steeply with distance', async () => {
        const close = await blastAt(1);
        const middling = await blastAt(3);
        const far = await blastAt(5);

        expect(close).toBeGreaterThan(middling);
        expect(middling).toBeGreaterThan(far);
        expect(far).toBeGreaterThan(0);
    });

    it('does nothing at all past twice its power', async () => {
        expect(await blastAt(7)).toBe(0);
    });

    it('reports itself as an explosion, and names who set it off', async () => {
        const creeper = stage.spawn(Creeper, 0, 0);
        const cow = stage.spawn(Cow, 4, 0);

        await explode(stage.world, new Vector3(0, 64, 0), { power: 3, source: creeper, breaksBlocks: false });

        expect(cow.getLastDamageSource()?.cause).toBe(DamageCause.Explosion);
        expect(cow.getLastDamageSource()?.attacker).toBe(creeper);
    });

    it('throws what it hurts away from the centre', async () => {
        const cow = stage.spawn(Cow, 3, 0);
        await explode(stage.world, new Vector3(0, 64, 0), { power: 3, breaksBlocks: false });

        // Queued rather than applied: a mob spends its knockback in the next `applyPhysics`.
        expect((cow as any).pendingKnockback?.impulse.getX()).toBeGreaterThan(0);
    });

    it('throws up particles', async () => {
        await explode(stage.world, new Vector3(0, 64, 0), { power: 3, breaksBlocks: false });

        expect(stage.effects).toContain(LevelEvent.PARTICLES_EXPLOSION);
    });

    describe('what it does to the world', () => {
        it('takes blocks out', async () => {
            const digging = scene({ solid: true });
            await explode(digging.world, new Vector3(0, 64, 0), { power: 3 });

            expect(digging.cleared.length).toBeGreaterThan(0);
        });

        it('leaves the world alone when mobGriefing is off', async () => {
            const polite = scene({ solid: true, griefing: false });
            await explode(polite.world, new Vector3(0, 64, 0), { power: 3 });

            expect(polite.cleared).toEqual([]);
        });

        it('still hurts things with mobGriefing off', async () => {
            const polite = scene({ solid: true, griefing: false });
            const cow = polite.spawn(Cow, 1, 0);

            await explode(polite.world, new Vector3(0, 64, 0), { power: 3 });

            expect(cow.getHealth()).toBeLessThan(10);
        });
    });
});
