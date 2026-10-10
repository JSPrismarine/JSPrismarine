import { beforeEach, describe, expect, it } from 'vitest';

import { Difficulty } from '@jsprismarine/minecraft';
import { GameRules } from '../world/GameRuleManager';
import { Position } from '../world/Position';
import { DamageCause } from './DamageCause';
import { freshEnvironment, tickEnvironment } from './MobEnvironment';
import Cow from './passive/Cow';
import { statsOf } from './MobStats';
import type { Mob } from './Mob';

/** Middle of the day and middle of the night, on vanilla's clock. */
const NOON = 6000;
const MIDNIGHT = 18000;

/**
 * What the world does to a mob standing in it.
 *
 * All of this applied only to players before: a player drowned and burned and starved, and a
 * zombie stood in lava indefinitely. The rules are shared now; only the bookkeeping differs.
 */

/** A world made entirely of one block, which is all these checks need. */
const scene = ({ block = 'air', rules = {} as Record<string, boolean>, ticks = NOON, sky = true } = {}) => {
    const hits: Array<{ amount: number; cause: DamageCause }> = [];

    const harm: Record<string, DamageCause | null> = {
        air: null,
        lava: DamageCause.Lava,
        fire: DamageCause.Fire,
        cactus: DamageCause.Contact
    };

    const world: any = {
        getName: () => 'test',
        getServer: () => ({
            post: () => {},
            getTick: () => 0,
            getConfig: () => ({ getDifficulty: () => Difficulty.NORMAL })
        }),
        sendActorEvent: async () => {},
        sendActorSound: async () => {},
        broadcastMove: async () => {},
        getGameRuleManager: () => ({
            getGameRule: (name: string) => [rules[name] ?? true, true]
        }),
        getTicks: () => ticks,
        getLoadedChunk: () => null
    };

    const spawn = <T extends Mob>(Species: new (options: any) => T): T => {
        const mob = new Species({ position: new Position(0, 64, 0, world) });

        // The mob reads the world through its `BlockView`, so the world is described to the view
        // rather than to the world - which is also how the mob itself sees it.
        const view: any = (mob as any).view;
        view.harmAt = () => harm[block] ?? null;
        view.isSolid = () => block === 'stone';
        view.isSubmerged = () => block === 'water';
        view.floorAt = () => -64;
        view.seesSky = () => sky;

        // Record the blow rather than take it, so the amount can be asserted rather than
        // reverse-engineered from a health bar.
        (mob as any).damage = async (amount: number, cause: DamageCause) => {
            hits.push({ amount, cause });
            return true;
        };

        return mob;
    };

    return { hits, spawn };
};

/** Runs `n` ticks of environment on a mob. */
const expose = async (mob: Mob, state: ReturnType<typeof freshEnvironment>, n: number) => {
    for (let i = 0; i < n; i++) await tickEnvironment(mob, state);
};

describe('a mob standing in something', () => {
    let stage: ReturnType<typeof scene>;
    let state: ReturnType<typeof freshEnvironment>;

    beforeEach(() => {
        stage = scene();
        state = freshEnvironment();
    });

    it('is left alone by open air', async () => {
        await expose(stage.spawn(Cow), state, 40);

        expect(stage.hits).toEqual([]);
    });

    describe('fire and lava', () => {
        it('burns in lava, four half-hearts at a time', async () => {
            const lava = scene({ block: 'lava' });
            await expose(lava.spawn(Cow), state, 10);

            expect(lava.hits).toContainEqual({ amount: 4, cause: DamageCause.Lava });
        });

        it('burns more slowly in fire', async () => {
            const fire = scene({ block: 'fire' });
            await expose(fire.spawn(Cow), state, 10);

            expect(fire.hits).toContainEqual({ amount: 1, cause: DamageCause.Fire });
        });

        it('keeps burning after it has got out', async () => {
            // Eight seconds, which is what makes walking *through* a fire worse than walking past
            // one, and what makes water worth running to.
            const fire = scene({ block: 'fire' });
            const mob = fire.spawn(Cow);
            await expose(mob, state, 1);

            const inTheFire = fire.hits.length;
            (mob as any).view.harmAt = () => null;
            await expose(mob, state, 40);

            expect(fire.hits.length).toBeGreaterThan(inTheFire);
            expect(mob.metadata.onFire).toBe(true);
        });

        it('respects the fireDamage gamerule', async () => {
            const safe = scene({ block: 'lava', rules: { [GameRules.FireDamage]: false } });
            await expose(safe.spawn(Cow), state, 40);

            expect(safe.hits).toEqual([]);
        });
    });

    describe('other ways the world hurts', () => {
        it('pricks on a cactus, and does not set anything alight', async () => {
            const cactus = scene({ block: 'cactus' });
            const mob = cactus.spawn(Cow);
            await expose(mob, state, 10);

            expect(cactus.hits).toContainEqual({ amount: 1, cause: DamageCause.Contact });
            expect(mob.metadata.onFire).toBe(false);
        });

        it('suffocates with a solid block where its head is', async () => {
            const buried = scene({ block: 'stone' });
            await expose(buried.spawn(Cow), state, 10);

            expect(buried.hits).toContainEqual({ amount: 1, cause: DamageCause.Suffocation });
        });

        it('drowns once its breath runs out, and not before', async () => {
            const water = scene({ block: 'water' });
            const mob = water.spawn(Cow);

            await expose(mob, state, 200);
            expect(water.hits).toEqual([]);

            await expose(mob, state, 200);
            expect(water.hits).toContainEqual({ amount: 2, cause: DamageCause.Drowning });
        });

        it('leaves something that breathes water alone, however long it stays under', async () => {
            // A cod's identifier on a mob that has one. None of the aquatic species has a brain
            // yet - every fish still extends `Entity` rather than `Mob` - so the flag is checked
            // where it is actually read rather than through a class that cannot be ticked.
            expect(statsOf('minecraft:cod').aquatic).toBe(true);

            const water = scene({ block: 'water' });
            const fish = water.spawn(Cow);
            (fish as any).getType = () => 'minecraft:cod';

            await expose(fish, state, 600);

            expect(water.hits).toEqual([]);
        });

        it('respects the drowningDamage gamerule', async () => {
            const safe = scene({ block: 'water', rules: { [GameRules.DrowningDamage]: false } });
            await expose(safe.spawn(Cow), state, 600);

            expect(safe.hits).toEqual([]);
        });
    });

    describe('daylight', () => {
        /** A cow with a zombie's identifier: the table decides who burns, not the class. */
        const undead = (stage: ReturnType<typeof scene>, type = 'minecraft:zombie') => {
            const mob = stage.spawn(Cow);
            (mob as any).getType = () => type;
            return mob;
        };

        it('sets an exposed zombie alight at noon', async () => {
            const day = scene();
            const zombie = undead(day);

            await expose(zombie, state, 10);

            expect(day.hits).toContainEqual({ amount: 1, cause: DamageCause.Fire });
            expect(zombie.metadata.onFire).toBe(true);
        });

        it('leaves it alone at night', async () => {
            const night = scene({ ticks: MIDNIGHT });
            await expose(undead(night), state, 40);

            expect(night.hits).toEqual([]);
        });

        it('leaves it alone under a roof', async () => {
            const sheltered = scene({ sky: false });
            await expose(undead(sheltered), state, 40);

            expect(sheltered.hits).toEqual([]);
        });

        it('leaves it alone with its head under water', async () => {
            // Which is why a drowned is safe in its river and alight the moment it climbs out.
            const wet = scene({ block: 'water' });
            const zombie = undead(wet, 'minecraft:drowned');

            await expose(zombie, state, 40);

            expect(wet.hits.filter((hit) => hit.cause === DamageCause.Fire)).toEqual([]);
        });

        it('leaves a husk alone, which is the whole point of a husk', async () => {
            const desert = scene();
            await expose(undead(desert, 'minecraft:husk'), state, 40);

            expect(desert.hits).toEqual([]);
        });

        it('leaves the living alone', async () => {
            const day = scene();
            await expose(day.spawn(Cow), state, 40);

            expect(day.hits).toEqual([]);
        });

        it('respects the fireDamage gamerule', async () => {
            const safe = scene({ rules: { [GameRules.FireDamage]: false } });
            await expose(undead(safe), state, 40);

            expect(safe.hits).toEqual([]);
        });
    });

    it('does nothing at all to something already dead', async () => {
        const lava = scene({ block: 'lava' });
        const mob = lava.spawn(Cow);
        mob.attributes.setValue('minecraft:health', 0);

        await expose(mob, state, 40);

        expect(lava.hits).toEqual([]);
    });
});
