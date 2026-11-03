import { Vector3 } from '@jsprismarine/math';
import AddActorPacket from '@jsprismarine/protocol/packet/AddActorPacket';
import MoveActorAbsolutePacket from '@jsprismarine/protocol/packet/MoveActorAbsolutePacket';
import PlaySoundPacket from '@jsprismarine/protocol/packet/PlaySoundPacket';
import { describe, expect, it } from 'vitest';

import { EyeOfEnderSignal } from '../entity/other/EyeOfEnderSignal';
import { Item } from '../item/Item';
import { fakePlayer } from '../testing/fakePlayer.test.helper';
import { Position } from '../world/Position';
import { NetworkWorldReplicator } from './NetworkWorldReplicator';

/**
 * What a client is sent for an eye of ender in flight.
 *
 * The eye is a written actor, so nothing about it goes through the data runtime's body sync:
 * its own `setPosition` tells the world, the world tells the replicator, and the replicator
 * queues one move per tracking client per tick. This is the whole path from a tick to a
 * packet, with the fake player's world routing moves to a real replicator.
 */
const thrownEye = () => {
    const fake = fakePlayer();
    const { player, world, server, sent, roster, namedSounds } = fake;
    const replicator = new NetworkWorldReplicator(world, server);
    Object.assign(world, {
        getPlayers: () => [player],
        broadcastMove: async (entity: EyeOfEnderSignal, teleport?: boolean) => replicator.entityMoved(entity, teleport),
        dropContents: async () => {}
    });
    // The fake player joins with no chunks requested, and a client that sees no chunks is
    // shown no entities.
    player.viewDistance = 8;

    const eye = new EyeOfEnderSignal({
        item: new Item({ runtimeId: 1, name: 'minecraft:ender_eye' }),
        random: () => 0.5,
        position: new Position(0.5, 64.9, 0.5, world)
    });
    eye.signalTo(new Vector3(100, 0, 0));

    return { player, sent, roster, namedSounds, replicator, eye };
};

/** Runs ticks the way the world does: every entity's update, then one movement flush. */
const tick = async (eye: EyeOfEnderSignal, replicator: NetworkWorldReplicator, ticks: number) => {
    for (let i = 1; i <= ticks; i++) {
        await eye.update(i);
        await replicator.flushMovement();
    }
};

describe('PlayerSession and an eye of ender signal', () => {
    it('shows the client the eye as an eye_of_ender_signal actor where it was thrown', async () => {
        const { player, sent, eye } = thrownEye();
        sent.length = 0;

        await player.getNetworkSession().considerEntity(eye);

        const added = sent.filter((p) => p instanceof AddActorPacket);
        expect(added).toHaveLength(1);
        expect(added[0]?.runtimeEntityId).toBe(eye.getRuntimeId());
        expect(added[0]?.type).toBe('minecraft:eye_of_ender_signal');
        expect(added[0]?.position.getX()).toBe(0.5);
        expect(added[0]?.position.getY()).toBe(64.9);
        expect(added[0]?.position.getZ()).toBe(0.5);
        expect(player.getNetworkSession().tracks(eye.getRuntimeId())).toBe(true);
    });

    it('moves the eye on the client once per tick, to where the server has it', async () => {
        const { player, sent, eye, replicator } = thrownEye();
        await player.getNetworkSession().considerEntity(eye);
        sent.length = 0;

        await tick(eye, replicator, 3);

        const moves = sent.filter((p) => p instanceof MoveActorAbsolutePacket);
        expect(moves).toHaveLength(3);
        expect(moves.every((p) => p.runtimeEntityId === eye.getRuntimeId())).toBe(true);
        const last = moves.at(-1)?.position;
        expect(last?.getX()).toBe(eye.getPosition().getX());
        expect(last?.getY()).toBe(eye.getPosition().getY());
        // Heading toward the stronghold, east and up.
        expect(last?.getX()).toBeGreaterThan(0.5);
        expect(last?.getY()).toBeGreaterThan(64.9);
    });

    it('sends a named sound with the volume and pitch it was played at', async () => {
        const { player, sent, replicator } = thrownEye();
        await player.getNetworkSession().considerEntity(
            new EyeOfEnderSignal({
                item: new Item({ runtimeId: 1, name: 'minecraft:ender_eye' }),
                random: () => 0.5,
                position: new Position(0.5, 64.9, 0.5, player.getWorld())
            })
        );
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
        const { player, eye, replicator, roster, namedSounds } = thrownEye();
        await player.getNetworkSession().considerEntity(eye);

        await tick(eye, replicator, 81);

        expect(roster).toContain('remove');
        // Named, not an actor `DEATH` sound: the client's sound tables have no entry for
        // the eye, so `DEATH` fell back to the player's hurt sound.
        expect(namedSounds).toEqual(['block.itemframe.break']);
    });
});
