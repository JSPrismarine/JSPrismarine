import AddActorPacket from '@jsprismarine/protocol/packet/AddActorPacket';
import MoveActorAbsolutePacket from '@jsprismarine/protocol/packet/MoveActorAbsolutePacket';
import PlaySoundPacket from '@jsprismarine/protocol/packet/PlaySoundPacket';
import { describe, expect, it } from 'vitest';

import RemoveActorPacket from '@jsprismarine/protocol/packet/RemoveActorPacket';
import type Server from '../Server';
import type { DataEntity } from '../entity/data/DataEntity';
import { entityFixture } from '../entity/data/testing';
import type { EntityFixture } from '../entity/data/testing';
import { fakePlayer } from '../testing/fakePlayer.test.helper';
import { sealOccurrences } from '../testing/occurrences.test.helper';
import { stub } from '../testing/stub.test.helper';
import { NetworkWorldReplicator } from './NetworkWorldReplicator';
import { replicateEntities } from '../testing/changeTicks.test.helper';

/**
 * What a client is sent for an eye of ender in flight.
 *
 * The eye is an entity of the store: the runtime flies the eye, each sealed tick of the store's
 * log goes to the replicator, and the replicator shows the eye from its entering entry and queues
 * one move per tracking client per tick from its position entries. This is that whole path from a
 * tick to a packet, with the fake player's world routing to a real replicator.
 */
const thrownEye = async () => {
    const fake = fakePlayer();
    const { session, player, world, server, sent } = fake;
    // Ids clear of the fake players', which the server's counter draws from one; a client is
    // never shown an entity with its own player's id.
    let nextId = 10_000;
    const fixture = entityFixture(undefined, {}, {}, () => (nextId += 1));
    // The replicator reads the eye's type from the content the eye's store was built with.
    const replicator = new NetworkWorldReplicator(
        world,
        stub<Server>({ ...server, getContent: () => fixture.content })
    );
    Object.assign(world, {
        getViewers: () => [session],
        viewerOf: (runtimeId: bigint) => (runtimeId === player.getRuntimeId() ? session : undefined),
        entityRelocated: () => {}
    });
    // The fake player joins with no chunks requested, and a client that sees no chunks is
    // shown no entities.
    session['viewDistance'] = 8;

    const thrown = { session, player, sent, replicator, fixture };
    let eye: DataEntity | undefined;
    await logged(thrown, () => {
        eye = fixture.runtime.eyesOfEnder.launch(
            { x: 0.5, y: 64.9, z: 0.5 },
            { x: 100, y: 0, z: 0 },
            { name: 'minecraft:ender_eye', count: 1 }
        );
    });
    if (eye === undefined) throw new Error('the fixture declares no eye of ender');
    return { ...thrown, eye, id: BigInt(eye.id) };
};

/** One tick of the store's log around `work`, read and sent in the phases a world runs, movement last. */
const logged = async (
    { fixture, replicator }: { fixture: EntityFixture; replicator: NetworkWorldReplicator },
    work: () => void
) => {
    fixture.runtime.store.beginTick();
    work();
    const sealed = fixture.runtime.store.sealTick();
    if (sealed !== undefined) replicator.tickSealed(sealed);
    await replicateEntities(replicator);
    await replicator.flushMovement();
};

/** Runs ticks the way the world does. */
const tick = async (thrown: Awaited<ReturnType<typeof thrownEye>>, ticks: number) => {
    for (let i = 1; i <= ticks; i++) await logged(thrown, () => thrown.fixture.runtime.tick(i));
};

describe('PlayerSession and an eye of ender signal', () => {
    it('shows the client the eye as an eye_of_ender_signal actor where it was thrown', async () => {
        const { session, sent, id } = await thrownEye();

        const added = sent.filter((p) => p instanceof AddActorPacket);
        expect(added).toHaveLength(1);
        expect(added[0]?.runtimeEntityId).toBe(id);
        expect(added[0]?.type).toBe('minecraft:eye_of_ender_signal');
        expect(added[0]?.position.getX()).toBe(0.5);
        expect(added[0]?.position.getY()).toBe(64.9);
        expect(added[0]?.position.getZ()).toBe(0.5);
        expect(session.tracks(id)).toBe(true);
    });

    it('moves the eye on the client once it sets off, to where the store has it', async () => {
        const thrown = await thrownEye();
        const { sent, eye, id } = thrown;
        sent.length = 0;

        await tick(thrown, 3);

        // The first tick carries the zero motion it was thrown with, so the eye moves from the
        // second on.
        const moves = sent.filter((p) => p instanceof MoveActorAbsolutePacket);
        expect(moves).toHaveLength(2);
        expect(moves.every((p) => p.runtimeEntityId === id)).toBe(true);
        const last = moves.at(-1)?.position;
        expect(last?.getX()).toBeCloseTo(eye.position.x, 5);
        expect(last?.getY()).toBeCloseTo(eye.position.y, 5);
        // Heading toward the stronghold, east and up.
        expect(last?.getX()).toBeGreaterThan(0.5);
        expect(last?.getY()).toBeGreaterThan(64.9);
    });

    it('sends a named sound with the volume and pitch it was played at', async () => {
        const { sent, replicator } = await thrownEye();
        sent.length = 0;

        // The thrown eye's bow: half volume and a low pitch, which is what tells a player an
        // eye left the hand rather than an arrow. Both have to survive the trip to the packet.
        sealOccurrences(replicator, {
            kind: 'occurrence',
            occurrence: 'named-sound',
            data: { x: 0.5, y: 64.9, z: 0.5, name: 'random.bow', volume: 0.5, pitch: 0.4 }
        });
        await replicator.flushOccurrences();

        const sounds = sent.filter((p) => p instanceof PlaySoundPacket);
        expect(sounds).toHaveLength(1);
        expect(sounds[0]?.name).toBe('random.bow');
        expect(sounds[0]?.volume).toBe(0.5);
        expect(sounds[0]?.pitch).toBe(0.4);
    });

    it('leaves the world with its break sound after eighty ticks', async () => {
        const thrown = await thrownEye();
        const { session, sent, fixture, eye, id } = thrown;
        sent.length = 0;

        await tick(thrown, 81);

        expect(eye.removed).toBe('discarded');
        expect(sent.filter((p) => p instanceof RemoveActorPacket)).toHaveLength(1);
        expect(session.tracks(id)).toBe(false);
        // Named, not an actor `DEATH` sound: the client's sound tables have no entry for the
        // eye, so `DEATH` fell back to the player's hurt sound.
        expect(fixture.world.sounds).toEqual(['block.itemframe.break']);
    });
});
