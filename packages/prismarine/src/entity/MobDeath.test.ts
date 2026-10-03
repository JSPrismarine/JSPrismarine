import { beforeEach, describe, expect, it } from 'vitest';

import { LevelSoundEvent } from '@jsprismarine/minecraft';
import Zombie from './hostile/Zombie';
import Chicken from './passive/Chicken';
import Cow from './passive/Cow';
import IronGolem from './neutral/IronGolem';
import Wolf from './neutral/Wolf';
import { ActorEvent } from '../network/packet/ActorEventPacket';
import { GameRules } from '../world/GameRuleManager';
import { Position } from '../world/Position';
import { AttributeIds } from './Attribute';
import { DamageCause } from './DamageCause';
import type { Item } from '../item/Item';
import type { Mob } from './Mob';

/**
 * What a mob is made of, and what happens when it runs out of it.
 *
 * Before any of this every mob had the base attribute defaults, so a chicken and an iron golem
 * both had twenty health and one point of attack - and neither ever died, because `onDeath` was
 * an empty hook and nothing removed a dead mob from the world.
 */

/** Everything a dying mob reaches for, and nothing else. */
const scene = ({ mobLoot = true } = {}) => {
    const flashes: ActorEvent[] = [];
    const noises: LevelSoundEvent[] = [];
    const dropped: Item[] = [];
    const removed: string[] = [];

    const world: any = {
        getName: () => 'test',
        getServer: () => ({ post: () => {}, getTick: () => 0, getRandom: () => () => 0.5 }),
        sendActorEvent: async (_entity: unknown, event: ActorEvent) => void flashes.push(event),
        sendActorSound: async (_entity: unknown, sound: LevelSoundEvent) => void noises.push(sound),
        broadcastMove: async () => {},
        getGameRuleManager: () => ({
            getGameRule: (name: string) => (name === GameRules.DoMobLoot ? [mobLoot, true] : [true, true])
        }),
        dropContents: async (_at: unknown, contents: Item[]) => void dropped.push(...contents),
        removeEntity: async (entity: Mob) => void removed.push(entity.getType()),
        // Nothing is loaded, so the movement half of `update` bows out and only the death
        // bookkeeping runs - which is exactly the half under test here.
        getLoadedChunk: () => null,
        getEntityGrid: () => ({ near: () => [] })
    };

    const spawn = <T>(Species: new (options: any) => T): T => new Species({ position: new Position(8, 64, 8, world) });

    return { flashes, noises, dropped, removed, spawn };
};

/** Runs the death animation out, and one tick past it. */
const waitOutDeath = async (mob: Mob) => {
    for (let tick = 0; tick <= 21; tick++) await mob.update(tick);
};

describe('mobs', () => {
    let world: ReturnType<typeof scene>;

    beforeEach(() => {
        world = scene();
    });

    describe('what each one is made of', () => {
        it('gives a chicken four health rather than a player’s twenty', () => {
            expect(world.spawn(Chicken).getMaxHealth()).toBe(4);
            expect(world.spawn(Chicken).getHealth()).toBe(4);
        });

        it('gives an iron golem a hundred, and raises the ceiling to match', () => {
            // The maximum has to move too, or the value would be clamped straight back to twenty
            // and the golem would be no tougher than a zombie.
            const golem = world.spawn(IronGolem);

            expect(golem.getMaxHealth()).toBe(100);
            expect(golem.getHealth()).toBe(100);
        });

        it('gives each species its own attack', () => {
            expect(world.spawn(Zombie).attributes.getValue(AttributeIds.AttackDamage)).toBe(3);
            expect(world.spawn(Wolf).attributes.getValue(AttributeIds.AttackDamage)).toBe(3);
            expect(world.spawn(Cow).attributes.getValue(AttributeIds.AttackDamage)).toBe(0);
        });

        it('makes an iron golem unshovable, and a cow not', () => {
            expect(world.spawn(IronGolem).attributes.getValue(AttributeIds.KnockbackResistence)).toBe(1);
            expect(world.spawn(Cow).attributes.getValue(AttributeIds.KnockbackResistence)).toBe(0);
        });
    });

    describe('dying', () => {
        it('plays the animation and the sound', async () => {
            const cow = world.spawn(Cow);
            await cow.damage(100, DamageCause.Generic);

            expect(world.flashes).toContain(ActorEvent.DEATH_ANIMATION);
            expect(world.noises).toContain(LevelSoundEvent.DEATH);
        });

        it('stays in the world while the client plays the animation', async () => {
            const cow = world.spawn(Cow);
            await cow.damage(100);

            expect(cow.isDying()).toBe(true);

            // Removing it the instant its health hit zero deleted it mid-roll, so a killed mob
            // simply vanished.
            for (let tick = 0; tick < 20; tick++) await cow.update(tick);
            expect(world.removed).toEqual([]);
        });

        it('is taken away once the animation is done', async () => {
            const cow = world.spawn(Cow);
            await cow.damage(100);
            await waitOutDeath(cow);

            expect(world.removed).toEqual(['minecraft:cow']);
        });

        it('is only removed once, however long it is ticked for', async () => {
            const cow = world.spawn(Cow);
            await cow.damage(100);

            for (let tick = 0; tick < 80; tick++) await cow.update(tick);

            expect(world.removed).toEqual(['minecraft:cow']);
        });

        it('stops taking damage once dead, and does not die twice', async () => {
            const cow = world.spawn(Cow);
            await cow.damage(100);

            const deaths = world.flashes.filter((event) => event === ActorEvent.DEATH_ANIMATION).length;
            await cow.damage(100);

            expect(world.flashes.filter((event) => event === ActorEvent.DEATH_ANIMATION)).toHaveLength(deaths);
        });
    });

    describe('what it leaves behind', () => {
        it('drops what the table says', async () => {
            const cow = world.spawn(Cow);
            await cow.damage(100);
            await waitOutDeath(cow);

            const names = world.dropped.map((item) => item.getName());
            expect(names).toContain('minecraft:beef');
            expect(names).toContain('minecraft:leather');
        });

        it('drops nothing before the animation is over', async () => {
            const cow = world.spawn(Cow);
            await cow.damage(100);

            for (let tick = 0; tick < 20; tick++) await cow.update(tick);
            expect(world.dropped).toEqual([]);
        });

        it('drops nothing at all for a mob with no table', async () => {
            const wolf = world.spawn(Wolf);
            await wolf.damage(100);
            await waitOutDeath(wolf);

            expect(world.dropped).toEqual([]);
            expect(world.removed).toEqual(['minecraft:wolf']);
        });

        it('respects the doMobLoot gamerule', async () => {
            const dry = scene({ mobLoot: false });
            const cow = dry.spawn(Cow);

            await cow.damage(100);
            await waitOutDeath(cow);

            expect(dry.dropped).toEqual([]);
            expect(dry.removed).toEqual(['minecraft:cow']);
        });
    });
});
