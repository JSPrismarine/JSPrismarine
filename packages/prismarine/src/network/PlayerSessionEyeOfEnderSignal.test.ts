import { Vector3 } from '@jsprismarine/math';
import AddActorPacket from '@jsprismarine/protocol/packet/AddActorPacket';
import MoveActorAbsolutePacket from '@jsprismarine/protocol/packet/MoveActorAbsolutePacket';
import PlaySoundPacket from '@jsprismarine/protocol/packet/PlaySoundPacket';
import { describe, expect, it } from 'vitest';

import type { Entity } from '../entity/Entity';
import { LiveBodies } from '../entity/data/liveBodies';
import { entityFixture } from '../entity/data/testing';
import { fakePlayer } from '../testing/fakePlayer.test.helper';
import { NetworkWorldReplicator } from './NetworkWorldReplicator';

/**
 * What a client is sent for an eye of ender in flight.
 *
 * The eye is an entity of the store. Until replication reads the change log, the mirror in
 * `liveBodies.ts` gives it a body: the runtime flies the eye, the mirror moves the body to where
 * the eye is, the world tells the replicator, and the replicator queues one move per tracking
 * client per tick. This is that whole path from a tick to a packet, with the fake player's world
 * routing moves to a real replicator.
 */
const thrownEye = () => {
    const fake = fakePlayer();
    const { player, world, server, sent, roster } = fake;
    const replicator = new NetworkWorldReplicator(world, server);
    Object.assign(world, {
        getPlayers: () => [player],
        entityRelocated: () => {},
        broadcastMove: async (entity: Entity, teleport?: boolean) => replicator.entityMoved(entity, teleport)
    });
    // The fake player joins with no chunks requested, and a client that sees no chunks is
    // shown no entities.
    player.viewDistance = 8;

    // Ids clear of the fake players', which the server's counter draws from one; a client is
    // never shown an entity with its own player's id.
    let nextId = 10_000;
    const fixture = entityFixture(undefined, {}, {}, () => (nextId += 1));
    const bodies = new LiveBodies({ world: () => world, report: () => {}, hurt: () => false });
    const eye = fixture.runtime.eyesOfEnder.launch(
        { x: 0.5, y: 64.9, z: 0.5 },
        { x: 100, y: 0, z: 0 },
        { name: 'minecraft:ender_eye', count: 1 }
    );
    if (eye === undefined) throw new Error('the fixture declares no eye of ender');
    bodies.add(eye);
    const body = bodies.bodyOf(eye.id);
    if (body === undefined) throw new Error('the mirror gave the eye no body');

    return { player, sent, roster, replicator, fixture, bodies, eye, body };
};

/** Runs ticks the way the world does: the store's tick, the mirror's sync, then one movement flush. */
const tick = async ({ fixture, bodies, replicator }: ReturnType<typeof thrownEye>, ticks: number) => {
    for (let i = 1; i <= ticks; i++) {
        fixture.runtime.store.beginTick();
        fixture.runtime.tick(i);
        fixture.runtime.store.sealTick();
        await Promise.all(bodies.sync(fixture.runtime));
        await replicator.flushMovement();
    }
};

describe('PlayerSession and an eye of ender signal', () => {
    it('shows the client the eye as an eye_of_ender_signal actor where it was thrown', async () => {
        const { player, sent, body } = thrownEye();
        sent.length = 0;

        await player.getNetworkSession().considerEntity(body);

        const added = sent.filter((p) => p instanceof AddActorPacket);
        expect(added).toHaveLength(1);
        expect(added[0]?.runtimeEntityId).toBe(body.getRuntimeId());
        expect(added[0]?.type).toBe('minecraft:eye_of_ender_signal');
        expect(added[0]?.position.getX()).toBe(0.5);
        expect(added[0]?.position.getY()).toBe(64.9);
        expect(added[0]?.position.getZ()).toBe(0.5);
        expect(player.getNetworkSession().tracks(body.getRuntimeId())).toBe(true);
    });

    it('moves the eye on the client once it sets off, to where the store has it', async () => {
        const thrown = thrownEye();
        const { player, sent, eye, body } = thrown;
        await player.getNetworkSession().considerEntity(body);
        sent.length = 0;

        await tick(thrown, 3);

        // The first tick carries the zero motion it was thrown with, so the eye moves from the
        // second on.
        const moves = sent.filter((p) => p instanceof MoveActorAbsolutePacket);
        expect(moves).toHaveLength(2);
        expect(moves.every((p) => p.runtimeEntityId === body.getRuntimeId())).toBe(true);
        const last = moves.at(-1)?.position;
        expect(last?.getX()).toBeCloseTo(eye.position.x, 5);
        expect(last?.getY()).toBeCloseTo(eye.position.y, 5);
        // Heading toward the stronghold, east and up.
        expect(last?.getX()).toBeGreaterThan(0.5);
        expect(last?.getY()).toBeGreaterThan(64.9);
    });

    it('sends a named sound with the volume and pitch it was played at', async () => {
        const { player, sent, replicator, body } = thrownEye();
        await player.getNetworkSession().considerEntity(body);
        sent.length = 0;

        // The thrown eye's bow: half volume and a low pitch, which is what tells a player an
        // eye left the hand rather than an arrow. Both have to survive the trip to the packet.
        replicator.namedSound(new Vector3(0.5, 64.9, 0.5), 'random.bow', { volume: 0.5, pitch: 0.4 });

        const sounds = sent.filter((p) => p instanceof PlaySoundPacket);
        expect(sounds).toHaveLength(1);
        expect(sounds[0]?.name).toBe('random.bow');
        expect(sounds[0]?.volume).toBe(0.5);
        expect(sounds[0]?.pitch).toBe(0.4);
    });

    it('leaves the world with its break sound after eighty ticks', async () => {
        const thrown = thrownEye();
        const { player, roster, fixture, bodies, eye, body } = thrown;
        await player.getNetworkSession().considerEntity(body);
        roster.length = 0;

        await tick(thrown, 81);
        // What `LiveEntityRuntime` does when the runtime removes an entity.
        expect(eye.removed).toBe('discarded');
        bodies.drop(eye);

        expect(roster).toContain('remove');
        // Named, not an actor `DEATH` sound: the client's sound tables have no entry for the
        // eye, so `DEATH` fell back to the player's hurt sound.
        expect(fixture.world.sounds).toEqual(['block.itemframe.break']);
    });
});
