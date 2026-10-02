import { beforeEach, describe, expect, it } from 'vitest';

import { Difficulty, Gametype } from '@jsprismarine/minecraft';
import type { Entity } from '../Entity';
import { DamageCause } from '../DamageCause';
import { DamageSource } from '../DamageSource';
import { scaleForDifficulty } from '../Difficulty';
import Cow from '../passive/Cow';
import IronGolem from '../neutral/IronGolem';
import Wolf from '../neutral/Wolf';
import Zombie from '../hostile/Zombie';
import Human from '../Human';
import { Position } from '../../world/Position';
import HurtByTargetGoal from './goals/HurtByTargetGoal';
import NearestAttackableTargetGoal from './goals/NearestAttackableTargetGoal';
import { monsters, players } from './Targeting';

/**
 * Choosing who to fight.
 *
 * The goals that pick a target, rather than the ones that walk to it or swing at it. Keeping the
 * three apart is what lets a zombie and an iron golem share every line of pursuit and differ only
 * in which filter they were built with, so this is where that difference is checked.
 */

const scene = () => {
    const nearby: Entity[] = [];

    const world: any = {
        getName: () => 'test',
        getServer: () => ({
            post: () => {},
            getTick: () => 0,
            getRandom: () => () => 0.5,
            getLogger: () => ({ verbose: () => {}, error: () => {}, debug: () => {}, warn: () => {} }),
            getConfig: () => ({ getDifficulty: () => Difficulty.NORMAL })
        }),
        sendActorEvent: async () => {},
        sendActorSound: async () => {},
        sendActorMetadata: async () => {},
        sendWorldEvent: async () => {},
        broadcastMove: async () => {},
        getGameRuleManager: () => ({ getGameRule: () => [true, true] }),
        removeEntity: async () => {},
        dropContents: async () => {},
        getLoadedChunk: () => null,
        // The goal asks the grid what is near it, not the whole world.
        getEntityGrid: () => ({ near: () => nearby })
    };

    const spawn = <T extends Entity>(Species: new (options: any) => T, x = 0, z = 0): T => {
        const entity = new Species({ position: new Position(x, 64, z, world) });
        nearby.push(entity);
        return entity;
    };

    const person = (x = 0, z = 0, gamemode = Gametype.SURVIVAL) => {
        const human = new Human({ position: new Position(x, 64, z, world) });
        (human as any).gamemode = gamemode;
        nearby.push(human);
        return human;
    };

    return { spawn, person, nearby };
};

describe('combat goals', () => {
    let stage: ReturnType<typeof scene>;

    beforeEach(() => {
        stage = scene();
    });

    describe('picking somebody out of a crowd', () => {
        it('takes the nearest one the filter accepts', () => {
            const zombie = stage.spawn(Zombie, 0, 0);
            stage.person(10, 0);
            const near = stage.person(3, 0);

            const goal = new NearestAttackableTargetGoal(players, 16);
            expect(goal.canUse(zombie)).toBe(true);
            goal.start(zombie);

            expect(zombie.getTarget()).toBe(near);
        });

        it('ignores anything past its range', () => {
            const zombie = stage.spawn(Zombie, 0, 0);
            stage.person(40, 0);

            expect(new NearestAttackableTargetGoal(players, 16).canUse(zombie)).toBe(false);
        });

        it('ignores a creative player, who is not prey', () => {
            const zombie = stage.spawn(Zombie, 0, 0);
            stage.person(3, 0, Gametype.CREATIVE);

            expect(new NearestAttackableTargetGoal(players, 16).canUse(zombie)).toBe(false);
        });

        it('does not go looking while it already has somebody', () => {
            // Re-picking every tick would make a mob swap between two equidistant players and
            // never reach either.
            const zombie = stage.spawn(Zombie, 0, 0);
            const first = stage.person(3, 0);
            zombie.setTarget(first);

            expect(new NearestAttackableTargetGoal(players, 16).canUse(zombie)).toBe(false);
        });

        it('never targets itself', () => {
            const zombie = stage.spawn(Zombie, 0, 0);

            expect(new NearestAttackableTargetGoal(() => true, 16).canUse(zombie)).toBe(false);
        });

        it('claims no lanes, so it runs alongside whatever is moving the mob', () => {
            // The whole reason vanilla's separate "target selector" is not needed here.
            expect(new NearestAttackableTargetGoal().lanes).toEqual([]);
        });
    });

    describe('what each filter accepts', () => {
        it('has a golem go for monsters and not for people', () => {
            const golem = stage.spawn(IronGolem, 0, 0);
            const zombie = stage.spawn(Zombie, 4, 0);
            stage.person(2, 0);

            const goal = new NearestAttackableTargetGoal(monsters, 16);
            expect(goal.canUse(golem)).toBe(true);
            goal.start(golem);

            // The player is nearer, and is not what a golem is for.
            expect(golem.getTarget()).toBe(zombie);
        });

        it('has a zombie go for people and not for other monsters', () => {
            const zombie = stage.spawn(Zombie, 0, 0);
            stage.spawn(Zombie, 2, 0);
            const victim = stage.person(4, 0);

            const goal = new NearestAttackableTargetGoal(players, 16);
            goal.canUse(zombie);
            goal.start(zombie);

            expect(zombie.getTarget()).toBe(victim);
        });

        it('leaves cows alone, whichever filter is asked', () => {
            const golem = stage.spawn(IronGolem, 0, 0);
            stage.spawn(Cow, 1, 0);

            expect(new NearestAttackableTargetGoal(monsters, 16).canUse(golem)).toBe(false);
        });
    });

    describe('fighting back', () => {
        it('turns on whoever hit it', async () => {
            const zombie = stage.spawn(Zombie, 0, 0);
            const skeleton = stage.spawn(Zombie, 3, 0);

            await zombie.damage(2, DamageSource.entity(skeleton));

            // This is the whole of mob-versus-mob: nothing here knows that mobs can fight each
            // other, only that something hurt this one.
            expect(new HurtByTargetGoal().canUse(zombie)).toBe(true);
            expect(zombie.getTarget()).toBe(skeleton);
        });

        it('does nothing for damage nobody is to blame for', async () => {
            const zombie = stage.spawn(Zombie, 0, 0);
            await zombie.damage(2, DamageCause.Fall);

            expect(new HurtByTargetGoal().canUse(zombie)).toBe(false);
            expect(zombie.getTarget()).toBeNull();
        });

        it('only reacts once to the same blow', async () => {
            // `getLastDamageSource` keeps its answer indefinitely, so without remembering which
            // blow has been seen the mob could never be distracted by anything else again.
            const zombie = stage.spawn(Zombie, 0, 0);
            const other = stage.spawn(Zombie, 3, 0);
            const goal = new HurtByTargetGoal();

            await zombie.damage(2, DamageSource.entity(other));
            expect(goal.canUse(zombie)).toBe(true);

            zombie.setTarget(null);
            expect(goal.canUse(zombie)).toBe(false);
        });

        it('is what makes a wild wolf neutral rather than passive', async () => {
            const wolf = stage.spawn(Wolf, 0, 0);
            const attacker = stage.person(2, 0);

            expect(wolf.getTarget()).toBeNull();
            await wolf.damage(2, DamageSource.entity(attacker));

            expect(new HurtByTargetGoal().canUse(wolf)).toBe(true);
            expect(wolf.getTarget()).toBe(attacker);
        });
    });

    describe('remembering a target', () => {
        it('forgets one that has died', async () => {
            const zombie = stage.spawn(Zombie, 0, 0);
            const cow = stage.spawn(Cow, 2, 0);
            zombie.setTarget(cow);

            await cow.damage(100);
            await zombie.update(0);

            expect(zombie.getTarget()).toBeNull();
        });

        it('keeps one that is merely far off, for a while', async () => {
            const zombie = stage.spawn(Zombie, 0, 0);
            const runner = stage.person(200, 0);
            zombie.setTarget(runner);

            for (let tick = 0; tick < 50; tick++) await zombie.update(tick);
            expect(zombie.getTarget()).toBe(runner);

            for (let tick = 0; tick < 60; tick++) await zombie.update(tick);
            expect(zombie.getTarget()).toBeNull();
        });
    });

    describe('difficulty', () => {
        it('halves a mob’s blow on easy and adds half again on hard', () => {
            expect(scaleForDifficulty(3, Difficulty.EASY)).toBe(2);
            expect(scaleForDifficulty(3, Difficulty.NORMAL)).toBe(3);
            expect(scaleForDifficulty(3, Difficulty.HARD)).toBe(5);
        });

        it('stops monsters hurting anybody at all on peaceful', () => {
            expect(scaleForDifficulty(7, Difficulty.PEACEFUL)).toBe(0);
        });

        it('treats an unrecognised setting as normal rather than as harmless', () => {
            expect(scaleForDifficulty(3, Difficulty.UNKNOWN)).toBe(3);
        });

        it('scales what a mob actually swings with', () => {
            const zombie = stage.spawn(Zombie, 0, 0);

            expect(zombie.getAttackDamage()).toBe(3);
        });
    });
});
