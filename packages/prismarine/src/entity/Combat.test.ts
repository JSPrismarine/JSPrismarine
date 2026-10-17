import { beforeEach, describe, expect, it } from 'vitest';

import { LevelEvent, LevelSoundEvent } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import DiamondSword from '../item/items/DiamondSword';
import GoldenSword from '../item/items/GoldenSword';
import IronSword from '../item/items/IronSword';
import WoodenSword from '../item/items/WoodenSword';
import DiamondPickaxe from '../item/items/DiamondPickaxe';
import { Item } from '../item/Item';
import { Position } from '../world/Position';
import { canHarm, CREATIVE_REACH, distanceToBody, meleeAttack, SURVIVAL_REACH } from './Combat';
import Cow from './passive/Cow';
import Zombie from './hostile/Zombie';
import Human from './Human';
import type { Entity } from './Entity';

/**
 * Melee attacks.
 *
 * The swing itself, not the packet that carries it: what the reach allows, what the damage comes
 * to, and what everybody nearby is told about it.
 */

/** Everything a fight reaches for, and nothing else. */
const scene = ({ pvp = true } = {}) => {
    const noises: Array<{ type: string; sound: LevelSoundEvent }> = [];
    const effects: LevelEvent[] = [];

    const world: any = {
        getName: () => 'test',
        getServer: () => ({ post: () => {}, getTick: () => 0, getRandom: () => () => 0.5 }),
        sendActorEvent: async () => {},
        sendActorSound: async (entity: Entity, sound: LevelSoundEvent) =>
            void noises.push({ type: entity.getType(), sound }),
        sendWorldEvent: async (_at: unknown, event: LevelEvent) => void effects.push(event),
        broadcastMove: async () => {},
        getGameRuleManager: () => ({ getGameRule: () => [pvp, true] }),
        getLoadedChunk: () => null,
        getEntityGrid: () => ({ near: () => [] })
    };

    const spawn = <T>(Species: new (options: any) => T, x = 0, z = 0): T =>
        new Species({ position: new Position(x, 64, z, world) });

    return { noises, effects, spawn, world };
};

/** A person, for the rules that only apply between two of them. Position is their eyes. */
const person = (world: any, x = 0, z = 0) => new Human({ position: new Position(x, 64, z, world) });

/**
 * Only the noises the attacker made.
 *
 * The one the target makes being hurt goes through the same channel, so an unfiltered list is
 * always a swing and a grunt rather than the swing under test.
 */
const swings = (stage: ReturnType<typeof scene>): LevelSoundEvent[] =>
    stage.noises.filter((noise) => noise.type === 'minecraft:zombie').map((noise) => noise.sound);

describe('melee', () => {
    let stage: ReturnType<typeof scene>;

    beforeEach(() => {
        stage = scene();
    });

    describe('weapon damage', () => {
        it('is one for a bare hand, and for anything that is not a weapon', () => {
            expect(new Item({ id: 0, name: 'minecraft:air' }).getAttackDamage()).toBe(1);
            expect(new Item({ id: 0, name: 'minecraft:torch' }).getAttackDamage()).toBe(1);
        });

        it('climbs with the tier of a sword', () => {
            expect(new WoodenSword().getAttackDamage()).toBe(4);
            expect(new IronSword().getAttackDamage()).toBe(6);
            expect(new DiamondSword().getAttackDamage()).toBe(7);
        });

        it('makes gold hit like wood, not like the tier it mines at', () => {
            // Gold sits between wood and stone in the harvest order, which is why a table indexed
            // by tier cannot be an ascending run of numbers.
            expect(new GoldenSword().getAttackDamage()).toBe(new WoodenSword().getAttackDamage());
        });

        it('makes a pickaxe worse than a sword of the same tier', () => {
            expect(new DiamondPickaxe().getAttackDamage()).toBeLessThan(new DiamondSword().getAttackDamage());
        });
    });

    describe('reach', () => {
        it('measures to the body, not to the position', () => {
            // A cow is 0.9 across, so its body starts 0.45 from its centre.
            const cow = stage.spawn(Cow, 0, 0);

            expect(distanceToBody(new Vector3(2, 64, 0), cow)).toBeCloseTo(2 - 0.45);
        });

        it('is zero for a point inside the body', () => {
            const cow = stage.spawn(Cow, 0, 0);

            expect(distanceToBody(new Vector3(0, 64.5, 0), cow)).toBe(0);
        });

        it('lands a blow within range', async () => {
            const attacker = stage.spawn(Zombie, 0, 0);
            const cow = stage.spawn(Cow, 2, 0);

            expect(await meleeAttack(attacker, cow, { reach: SURVIVAL_REACH, damage: 4 })).toBe(true);
            expect(cow.getHealth()).toBe(6);
        });

        it('refuses one out of range, and does not even make a noise about it', async () => {
            const attacker = stage.spawn(Zombie, 0, 0);
            const cow = stage.spawn(Cow, 40, 0);

            expect(await meleeAttack(attacker, cow, { reach: SURVIVAL_REACH, damage: 4 })).toBe(false);
            expect(cow.getHealth()).toBe(10);
            expect(stage.noises).toEqual([]);
        });

        it('reaches further in creative than in survival', async () => {
            const near = scene();
            const far = scene();

            const survival = await meleeAttack(near.spawn(Zombie, 0, 0), near.spawn(Cow, 4.5, 0), {
                reach: SURVIVAL_REACH,
                damage: 4
            });
            const creative = await meleeAttack(far.spawn(Zombie, 0, 0), far.spawn(Cow, 4.5, 0), {
                reach: CREATIVE_REACH,
                damage: 4
            });

            expect(survival).toBe(false);
            expect(creative).toBe(true);
        });
    });

    describe('what gets through', () => {
        it('falls back to the attacker’s own attack attribute', async () => {
            // A zombie's three, from `MobStats` - what a mob swings with when nobody says.
            const zombie = stage.spawn(Zombie, 0, 0);
            const cow = stage.spawn(Cow, 1, 0);

            await meleeAttack(zombie, cow);

            expect(cow.getHealth()).toBe(7);
        });

        it('is half again as much for a critical, and throws stars', async () => {
            const attacker = stage.spawn(Zombie, 0, 0);
            const cow = stage.spawn(Cow, 1, 0);

            await meleeAttack(attacker, cow, { damage: 4, critical: true });

            expect(cow.getHealth()).toBe(4);
            expect(stage.effects).toContain(LevelEvent.PARTICLES_CRIT);
        });

        it('passes the sprint through to the blow, so it shoves harder', async () => {
            // What the extra level *does* is `Entity.knockbackFrom`'s business and is tested
            // there. All this has to get right is carrying it.
            const cow = stage.spawn(Cow, 1, 0);
            await meleeAttack(stage.spawn(Zombie, 0, 0), cow, { damage: 1, knockbackLevels: 1 });

            expect(cow.getLastDamageSource()?.knockbackLevels).toBe(1);
        });

        it('makes the empty-handed noise when the blow does nothing', async () => {
            const attacker = stage.spawn(Zombie, 0, 0);
            const cow = stage.spawn(Cow, 1, 0);

            await meleeAttack(attacker, cow, { damage: 0 });

            expect(swings(stage)).toEqual([LevelSoundEvent.ATTACK_NODAMAGE]);
            expect(cow.getHealth()).toBe(10);
        });

        it('makes the strong noise for a critical and the plain one otherwise', async () => {
            const soft = scene();
            const hard = scene();

            await meleeAttack(soft.spawn(Zombie, 0, 0), soft.spawn(Cow, 1, 0), { damage: 4 });
            await meleeAttack(hard.spawn(Zombie, 0, 0), hard.spawn(Cow, 1, 0), { damage: 4, critical: true });

            expect(swings(soft)).toEqual([LevelSoundEvent.ATTACK]);
            expect(swings(hard)).toEqual([LevelSoundEvent.ATTACK_STRONG]);
        });

        it('is swallowed by the target’s grace period, and costs the attacker nothing', async () => {
            const attacker = stage.spawn(Zombie, 0, 0);
            const cow = stage.spawn(Cow, 1, 0);

            expect(await meleeAttack(attacker, cow, { damage: 3 })).toBe(true);
            expect(await meleeAttack(attacker, cow, { damage: 3 })).toBe(false);
            expect(cow.getHealth()).toBe(7);
        });
    });

    describe('who may hit whom', () => {
        it('refuses to let anything hit itself', () => {
            const cow = stage.spawn(Cow, 0, 0);

            expect(canHarm(cow, cow)).toBe(false);
        });

        it('refuses to hit something already dead', async () => {
            const cow = stage.spawn(Cow, 0, 0);
            await cow.damage(100);

            // A mob keeps its place for a second while its death animation plays, and would
            // otherwise be a punchbag for that second.
            expect(cow.isDying()).toBe(true);
            expect(canHarm(stage.spawn(Zombie, 1, 0), cow)).toBe(false);
        });

        it('lets a player hit a mob whatever the pvp gamerule says', () => {
            const off = scene({ pvp: false });

            expect(canHarm(person(off.world, 0, 0), off.spawn(Cow, 1, 0))).toBe(true);
        });

        it('stops one player hitting another when pvp is off', () => {
            const off = scene({ pvp: false });

            expect(canHarm(person(off.world, 0, 0), person(off.world, 1, 0))).toBe(false);
        });

        it('allows it when pvp is on', () => {
            expect(canHarm(person(stage.world, 0, 0), person(stage.world, 1, 0))).toBe(true);
        });
    });
});
