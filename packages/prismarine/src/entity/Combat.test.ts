import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LevelEvent, LevelSoundEvent } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { storeWorld } from '../testing/storeWorld.test.helper';
import { stub, stubOf } from '../testing/stub.test.helper';
import type GameRuleManager from '../world/GameRuleManager';
import { StoreActor } from './data/storeActors';
import { PLAYER_IDENTIFIER } from './playerOverlay';
import { Item } from '../item/Item';
import { canHarm, CREATIVE_REACH, distanceToBody, meleeAttack, SURVIVAL_REACH } from './Combat';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';

/**
 * Melee attacks.
 *
 * The swing itself, not the packet that carries it: what the reach allows, what the damage comes
 * to, and what everybody nearby is told about it.
 */

/** What every mob in this file has, which is what the damage expectations count down from. */
const MOB_HEALTH = 10;

/** A stack of one vanilla item, whose attack damage comes from its Java components. */
const item = (name: string) => new Item({ name });

/** Everything a fight reaches for, over a real entity store, and nothing else. */
const scene = ({ pvp = true } = {}) => {
    const noises: Array<{ actor: StoreActor; sound: LevelSoundEvent }> = [];
    const effects: LevelEvent[] = [];
    const { world, live } = storeWorld();

    Object.assign(world, {
        sendActorEvent: async () => {},
        sendActorSound: async (actor: StoreActor, sound: LevelSoundEvent) => void noises.push({ actor, sound }),
        sendWorldEvent: async (_at: unknown, event: LevelEvent) => void effects.push(event),
        broadcastMove: async () => {},
        sendActorMetadata: async () => {},
        getGameRuleManager: () => stub<GameRuleManager>({ getGameRule: () => [pvp, true] }),
        getLoadedChunk: () => null,
        getTicks: () => 0,
        getActor: (runtimeId: bigint) => live.actors.actorOf(Number(runtimeId)) ?? null,
        dataEntities: () => live
    });

    /**
     * A mob at a place, in the store, seen through its actor. The health is stated here rather
     * than taken from a table, because every expectation below counts down from it.
     */
    const spawn = (identifier: string, x = 0, z = 0): StoreActor => {
        const entity = live.runtime.spawn(identifier, { x, y: 64, z });
        const actor = entity === undefined ? undefined : live.actors.actorOf(entity.id);
        if (entity === undefined || actor === undefined) throw new Error(`the fixture declares no ${identifier}`);
        entity.instance.attributes.set('health', MOB_HEALTH);
        return actor;
    };

    return { noises, effects, spawn, world, live };
};

/** A person, for the rules that only apply between two of them: an actor of the player's type. */
const person = (stage: ReturnType<typeof scene>, x = 0, z = 0): StoreActor =>
    stubOf(StoreActor, {
        getType: () => PLAYER_IDENTIFIER,
        getWorld: () => stage.world,
        getPosition: () => new Vector3(x, 64, z),
        isAlive: () => true
    });

/**
 * Only the noises the attacker made.
 *
 * The one the target makes being hurt goes through the same channel, so an unfiltered list is
 * always a swing and a grunt rather than the swing under test.
 */
const swings = (stage: ReturnType<typeof scene>, attacker: StoreActor): LevelSoundEvent[] =>
    stage.noises.filter((noise) => noise.actor === attacker).map((noise) => noise.sound);

describe('melee', () => {
    let stage: ReturnType<typeof scene>;

    beforeEach(() => {
        stage = scene();
    });

    describe('weapon damage', () => {
        it('is one for a bare hand, and for anything that is not a weapon', () => {
            expect(new Item({ runtimeId: 0, name: 'minecraft:air' }).getAttackDamage()).toBe(1);
            expect(new Item({ runtimeId: 0, name: 'minecraft:torch' }).getAttackDamage()).toBe(1);
        });

        it('climbs with the tier of a sword', () => {
            expect(item('minecraft:wooden_sword').getAttackDamage()).toBe(4);
            expect(item('minecraft:iron_sword').getAttackDamage()).toBe(6);
            expect(item('minecraft:diamond_sword').getAttackDamage()).toBe(7);
        });

        it('makes gold hit like wood, not like the tier it mines at', () => {
            // Gold sits between wood and stone in the harvest order, which is why a table indexed
            // by tier cannot be an ascending run of numbers.
            expect(item('minecraft:golden_sword').getAttackDamage()).toBe(
                item('minecraft:wooden_sword').getAttackDamage()
            );
        });

        it('makes a pickaxe worse than a sword of the same tier', () => {
            expect(item('minecraft:diamond_pickaxe').getAttackDamage()).toBeLessThan(
                item('minecraft:diamond_sword').getAttackDamage()
            );
        });
    });

    describe('reach', () => {
        it('measures to the body, not to the position', () => {
            // A cow is 0.9 across, so its body starts 0.45 from its center.
            const cow = stage.spawn('minecraft:cow', 0, 0);

            expect(distanceToBody(new Vector3(2, 64, 0), cow)).toBeCloseTo(2 - 0.45);
        });

        it('is zero for a point inside the body', () => {
            const cow = stage.spawn('minecraft:cow', 0, 0);

            expect(distanceToBody(new Vector3(0, 64.5, 0), cow)).toBe(0);
        });

        it('lands a blow within range', async () => {
            const attacker = stage.spawn('minecraft:cow', 0, 0);
            const cow = stage.spawn('minecraft:cow', 2, 0);

            expect(meleeAttack(attacker, cow, { reach: SURVIVAL_REACH, damage: 4 })).toBe(true);
            expect(cow.getHealth()).toBe(6);
        });

        it('refuses one out of range, and does not even make a noise about it', async () => {
            const attacker = stage.spawn('minecraft:cow', 0, 0);
            const cow = stage.spawn('minecraft:cow', 40, 0);

            expect(meleeAttack(attacker, cow, { reach: SURVIVAL_REACH, damage: 4 })).toBe(false);
            expect(cow.getHealth()).toBe(10);
            expect(stage.noises).toEqual([]);
        });

        it('reaches further in creative than in survival', async () => {
            const near = scene();
            const far = scene();

            const survival = meleeAttack(near.spawn('minecraft:cow', 0, 0), near.spawn('minecraft:cow', 4.5, 0), {
                reach: SURVIVAL_REACH,
                damage: 4
            });
            const creative = meleeAttack(far.spawn('minecraft:cow', 0, 0), far.spawn('minecraft:cow', 4.5, 0), {
                reach: CREATIVE_REACH,
                damage: 4
            });

            expect(survival).toBe(false);
            expect(creative).toBe(true);
        });
    });

    describe('what gets through', () => {
        it('falls back to the attacker’s own attack attribute', async () => {
            // The attribute and nothing else: no weapon, no stated damage.
            const zombie = stage.spawn('minecraft:cow', 0, 0);
            zombie.attributes.setValue(AttributeIds.AttackDamage, 3);
            const cow = stage.spawn('minecraft:cow', 1, 0);

            meleeAttack(zombie, cow);

            expect(cow.getHealth()).toBe(7);
        });

        it('is half again as much for a critical, and throws stars', async () => {
            const attacker = stage.spawn('minecraft:cow', 0, 0);
            const cow = stage.spawn('minecraft:cow', 1, 0);

            meleeAttack(attacker, cow, { damage: 4, critical: true });

            expect(cow.getHealth()).toBe(4);
            expect(stage.effects).toContain(LevelEvent.PARTICLES_CRIT);
        });

        it('passes the sprint through to the blow, so it shoves harder', async () => {
            // What the extra level *does* is the damage pipeline's business and is tested there.
            // All this has to get right is carrying it.
            const cow = stage.spawn('minecraft:cow', 1, 0);
            const blows = vi.spyOn(stage.live, 'damageEntity');
            meleeAttack(stage.spawn('minecraft:cow', 0, 0), cow, { damage: 1, knockbackLevels: 1 });

            expect(blows.mock.calls[0]?.[2].knockbackLevels).toBe(1);
        });

        it('makes the empty-handed noise when the blow does nothing', async () => {
            const attacker = stage.spawn('minecraft:cow', 0, 0);
            const cow = stage.spawn('minecraft:cow', 1, 0);

            meleeAttack(attacker, cow, { damage: 0 });

            expect(swings(stage, attacker)).toEqual([LevelSoundEvent.ATTACK_NODAMAGE]);
            expect(cow.getHealth()).toBe(10);
        });

        it('makes the strong noise for a critical and the plain one otherwise', async () => {
            const soft = scene();
            const hard = scene();

            const softly = soft.spawn('minecraft:cow', 0, 0);
            const hardly = hard.spawn('minecraft:cow', 0, 0);
            meleeAttack(softly, soft.spawn('minecraft:cow', 1, 0), { damage: 4 });
            meleeAttack(hardly, hard.spawn('minecraft:cow', 1, 0), { damage: 4, critical: true });

            expect(swings(soft, softly)).toEqual([LevelSoundEvent.ATTACK]);
            expect(swings(hard, hardly)).toEqual([LevelSoundEvent.ATTACK_STRONG]);
        });
    });

    describe('who may hit whom', () => {
        it('refuses to let anything hit itself', () => {
            const cow = stage.spawn('minecraft:cow', 0, 0);

            expect(canHarm(cow, cow)).toBe(false);
        });

        it('refuses to hit something already dead', async () => {
            const cow = stage.spawn('minecraft:cow', 0, 0);
            await cow.damage(100);

            // A body keeps its place for a moment after the blow that killed it, and would
            // otherwise be a punchbag for that moment.
            expect(cow.isAlive()).toBe(false);
            expect(canHarm(stage.spawn('minecraft:cow', 1, 0), cow)).toBe(false);
        });

        it('lets a player hit a mob whatever the pvp gamerule says', () => {
            const off = scene({ pvp: false });

            expect(canHarm(person(off, 0, 0), off.spawn('minecraft:cow', 1, 0))).toBe(true);
        });

        it('stops one player hitting another when pvp is off', () => {
            const off = scene({ pvp: false });

            expect(canHarm(person(off, 0, 0), person(off, 1, 0))).toBe(false);
        });

        it('allows it when pvp is on', () => {
            expect(canHarm(person(stage, 0, 0), person(stage, 1, 0))).toBe(true);
        });
    });
});
