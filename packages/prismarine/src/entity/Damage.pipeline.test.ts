import { beforeEach, describe, expect, it } from 'vitest';

import { LevelSoundEvent } from '@jsprismarine/minecraft';
import { ActorEvent } from '../network/packet/ActorEventPacket';
import { Position } from '../world/Position';
import { AttributeIds } from './Attribute';
import { DamageCause } from './DamageCause';
import { DamageSource } from './DamageSource';
import { Entity } from './Entity';

/**
 * The damage pipeline on `Entity`: grace periods, absorption, knockback and the events.
 *
 * The arithmetic itself is checked in `Damage.test.ts`. What is tested here is the order things
 * happen in and what gets skipped, which is where all the behaviour a player would notice lives.
 */

/** Records the shoves instead of moving, since a bare `Entity` has no velocity to move with. */
class Dummy extends Entity {
    public static override MOB_ID = 'jsprismarine:dummy';

    public shoves: Array<{ x: number; z: number; strength: number }> = [];
    public armorPoints = 0;
    public armorToughness = 0;

    public override applyKnockback(directionX: number, directionZ: number, strength: number): void {
        this.shoves.push({ x: directionX, z: directionZ, strength });
    }

    public override getArmorDefensePoints(): number {
        return this.armorPoints;
    }

    public override getArmorToughness(): number {
        return this.armorToughness;
    }
}

/** Everything a hurt entity reaches for, and nothing else. */
const scene = () => {
    const posted: Array<[string, any]> = [];
    const flashes: Array<{ id: bigint; event: ActorEvent }> = [];
    const noises: Array<{ id: bigint; sound: LevelSoundEvent }> = [];

    const server: any = {
        post: (payload: [string, any]) => posted.push(payload),
        getTick: () => 0
    };

    const world: any = {
        getName: () => 'test',
        getServer: () => server,
        sendActorEvent: async (entity: Entity, event: ActorEvent) => {
            flashes.push({ id: entity.getRuntimeId(), event });
        },
        sendActorSound: async (entity: Entity, sound: LevelSoundEvent) => {
            noises.push({ id: entity.getRuntimeId(), sound });
        },
        broadcastMove: async () => {}
    };

    const at = (x: number, z: number) => new Dummy({ position: new Position(x, 64, z, world) });

    return { posted, flashes, noises, at };
};

/** Runs the grace period out, which is what the world's tick would otherwise do. */
const waitOutGrace = async (entity: Entity) => {
    for (let tick = 0; tick < 10; tick++) await entity.update(tick);
};

describe('the damage pipeline', () => {
    let world: ReturnType<typeof scene>;

    beforeEach(() => {
        world = scene();
    });

    describe('invulnerability frames', () => {
        it('ignores a second hit no worse than the first', async () => {
            const victim = world.at(0, 0);

            expect(await victim.damage(4)).toBe(true);
            expect(await victim.damage(4)).toBe(false);
            expect(victim.getHealth()).toBe(16);
        });

        it('lets a harder hit through, but only for the difference', async () => {
            // What makes swinging a better weapon at a freshly-hit target worth doing.
            const victim = world.at(0, 0);

            await victim.damage(4);
            expect(await victim.damage(7)).toBe(true);
            expect(victim.getHealth()).toBe(20 - 7);
        });

        it('does not flash or shove again for that difference', async () => {
            const victim = world.at(0, 0);
            const attacker = world.at(2, 0);

            await victim.damage(4, DamageSource.entity(attacker));
            await victim.damage(7, DamageSource.entity(attacker));

            expect(world.flashes).toHaveLength(1);
            expect(victim.shoves).toHaveLength(1);
        });

        it('takes another full hit once the grace has run out', async () => {
            const victim = world.at(0, 0);

            await victim.damage(4);
            await waitOutGrace(victim);

            expect(await victim.damage(4)).toBe(true);
            expect(victim.getHealth()).toBe(12);
        });

        it('lets the void through regardless', async () => {
            const victim = world.at(0, 0);

            await victim.damage(4);
            expect(await victim.damage(4, DamageCause.Void)).toBe(true);
        });
    });

    describe('what reaches the health', () => {
        it('is reduced by armour', async () => {
            const victim = world.at(0, 0);
            victim.armorPoints = 15;

            await victim.damage(10);

            expect(victim.getHealth()).toBeCloseTo(14);
        });

        it('ignores that armour when the cause does', async () => {
            const victim = world.at(0, 0);
            victim.armorPoints = 15;

            await victim.damage(10, DamageCause.Drowning);

            expect(victim.getHealth()).toBeCloseTo(10);
        });

        it('spends absorption first, and does not give it back', async () => {
            const victim = world.at(0, 0);
            victim.attributes.setValue(AttributeIds.Absorption, 4);

            await victim.damage(6);

            expect(victim.getHealth()).toBe(18);
            expect(victim.attributes.getValue(AttributeIds.Absorption)).toBe(0);
        });

        it('leaves the health alone while there is absorption to spend', async () => {
            const victim = world.at(0, 0);
            victim.attributes.setValue(AttributeIds.Absorption, 10);

            await victim.damage(6);

            expect(victim.getHealth()).toBe(20);
            expect(victim.attributes.getValue(AttributeIds.Absorption)).toBe(4);
        });
    });

    describe('knockback', () => {
        it('pushes away from the attacker', async () => {
            const victim = world.at(0, 0);
            const attacker = world.at(-3, 0);

            await victim.damage(2, DamageSource.entity(attacker));

            expect(victim.shoves).toHaveLength(1);
            expect(victim.shoves[0]!.x).toBeCloseTo(1);
            expect(victim.shoves[0]!.z).toBeCloseTo(0);
        });

        it('pushes harder for each level of sprint or Knockback', async () => {
            const plain = world.at(0, 0);
            const hard = world.at(0, 0);
            const attacker = world.at(-3, 0);

            await plain.damage(2, DamageSource.entity(attacker));
            await hard.damage(2, DamageSource.entity(attacker, 2));

            expect(hard.shoves[0]!.strength).toBeGreaterThan(plain.shoves[0]!.strength);
        });

        it('is scaled away by knockback resistance', async () => {
            const victim = world.at(0, 0);
            const attacker = world.at(-3, 0);
            victim.attributes.setValue(AttributeIds.KnockbackResistence, 1);

            await victim.damage(2, DamageSource.entity(attacker));

            expect(victim.shoves).toEqual([]);
        });

        it('does not shove for something with nobody behind it', async () => {
            const victim = world.at(0, 0);

            await victim.damage(2, DamageCause.Fall);

            expect(victim.shoves).toEqual([]);
        });

        it('picks a direction rather than dividing by zero when the two overlap exactly', async () => {
            const victim = world.at(0, 0);
            const attacker = world.at(0, 0);

            await victim.damage(2, DamageSource.entity(attacker));

            const shove = victim.shoves[0]!;
            expect(Number.isFinite(shove.x) && Number.isFinite(shove.z)).toBe(true);
            expect(Math.hypot(shove.x, shove.z)).toBeCloseTo(1);
        });
    });

    describe('events', () => {
        it('can be cancelled, and then nothing happens at all', async () => {
            const victim = world.at(0, 0);
            const attacker = world.at(-3, 0);

            // The event the listener sees is the same object the pipeline goes on to read, which
            // is what makes cancelling it from here work at all.
            (victim as any).server.post = ([name, event]: [string, any]) => {
                if (name === 'entityDamage') event.preventDefault();
            };

            expect(await victim.damage(6, DamageSource.entity(attacker))).toBe(false);
            expect(victim.getHealth()).toBe(20);
            expect(victim.shoves).toEqual([]);
            expect(world.flashes).toEqual([]);
        });

        it('lets a listener change the blow', async () => {
            const victim = world.at(0, 0);
            (victim as any).server.post = ([name, event]: [string, any]) => {
                if (name === 'entityDamage') event.setAmount(2);
            };

            await victim.damage(10);

            expect(victim.getHealth()).toBe(18);
        });

        it('announces a death once, with what caused it', async () => {
            const victim = world.at(0, 0);
            const attacker = world.at(-3, 0);

            await victim.damage(100, DamageSource.entity(attacker));

            const deaths = world.posted.filter(([name]) => name === 'entityDeath');
            expect(deaths).toHaveLength(1);
            expect(deaths[0]![1].getSource().attacker).toBe(attacker);
        });

        it('does not announce a second death for something already dead', async () => {
            const victim = world.at(0, 0);

            await victim.damage(100);
            await victim.damage(100);

            expect(world.posted.filter(([name]) => name === 'entityDeath')).toHaveLength(1);
        });
    });

    describe('what it remembers', () => {
        it('keeps the last source past the grace period, for whoever wants to retaliate', async () => {
            const victim = world.at(0, 0);
            const attacker = world.at(-3, 0);

            await victim.damage(2, DamageSource.entity(attacker));
            await waitOutGrace(victim);

            expect(victim.getLastDamageSource()?.attacker).toBe(attacker);
        });

        it('flashes red and grunts on a hit that lands', async () => {
            // Both, because the flash is the client's own animation and makes no noise: health
            // arriving as a smaller number with only the event sent was a silent hit.
            const victim = world.at(0, 0);

            await victim.damage(2);

            expect(world.flashes).toEqual([{ id: victim.getRuntimeId(), event: ActorEvent.HURT_ANIMATION }]);
            expect(world.noises).toEqual([{ id: victim.getRuntimeId(), sound: LevelSoundEvent.HURT }]);
        });
    });
});
