import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { LevelSoundEvent } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import type { NetworkWorldReplicator, WorldReplicators } from '../NetworkWorldReplicator';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type { StubMembers } from '../../testing/stub.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import type DataPacket from '../packet/DataPacket';
import LevelSoundEventPacket from '../packet/LevelSoundEventPacket';
import LevelSoundEventHandler from './LevelSoundEventHandler';

const SENDER_ID = 7n;

/** A sender at the origin, and a replicator that records what it was asked to play and where. */
const fakeSession = () => {
    const played: { position: Vector3; packet: DataPacket }[] = [];
    const world = stub<World>({});
    const player = stub<Player>({
        getName: () => 'tester',
        getRuntimeId: () => SENDER_ID,
        getType: () => 'minecraft:player',
        getPosition: () => new Position(0, 64, 0, world),
        getWorld: () => world
    });

    const replicator = stub<NetworkWorldReplicator>({
        sendAround: (position, packet) => void played.push({ position, packet })
    });

    return {
        played,
        server: stub<Server>({
            getLogger: () => stub<Logger>({ verbose: () => {} }),
            getWorldReplicators: () => stub<WorldReplicators>({ for: () => replicator })
        }),
        session: stub<PlayerSession>({ getPlayer: () => player })
    };
};

const soundAt = (x: number, y: number, z: number, fields: StubMembers<LevelSoundEventPacket> = {}) =>
    Object.assign(new LevelSoundEventPacket(), {
        sound: LevelSoundEvent.ATTACK_NODAMAGE,
        positionX: x,
        positionY: y,
        positionZ: z,
        ...fields
    });

describe('LevelSoundEventHandler', () => {
    it('relays a sound the sender is standing next to', async () => {
        const { played, server, session } = fakeSession();

        await new LevelSoundEventHandler().handle(soundAt(2, 64, 1), server, session);

        expect(played.map(({ position }) => position)).toEqual([new Vector3(2, 64, 1)]);
    });

    it('relays a sound the sender attributes to itself', async () => {
        const { played, server, session } = fakeSession();

        await new LevelSoundEventHandler().handle(
            soundAt(0, 64, 0, { entityUniqueId: SENDER_ID, entityType: 'minecraft:player' }),
            server,
            session
        );

        expect(played).toHaveLength(1);
    });

    it('drops a sound reported from somewhere the sender is not', async () => {
        const { played, server, session } = fakeSession();

        await new LevelSoundEventHandler().handle(soundAt(5000, 64, -5000), server, session);

        expect(played).toEqual([]);
    });

    it('drops a sound attributed to another actor', async () => {
        const { played, server, session } = fakeSession();

        await new LevelSoundEventHandler().handle(soundAt(0, 64, 0, { entityUniqueId: 99n }), server, session);

        expect(played).toEqual([]);
    });

    it('drops a sound attributed to another kind of actor', async () => {
        const { played, server, session } = fakeSession();

        await new LevelSoundEventHandler().handle(
            soundAt(0, 64, 0, { entityType: 'minecraft:zombie' }),
            server,
            session
        );

        expect(played).toEqual([]);
    });

    it('relays the packet the client sent, already encoded, so its bytes go out unchanged', async () => {
        const { played, server, session } = fakeSession();
        const bytes = Buffer.concat([
            Buffer.from([0x7b, 0x04]),
            Buffer.from('step'),
            Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x42, 0x00, 0x00, 0x00, 0x00]), // 0, 64, 0
            Buffer.from([0x01]), // Data -1
            Buffer.from([0x10]),
            Buffer.from('minecraft:player'),
            Buffer.from([0x00, 0x00]), // Is Baby, Is Global
            Buffer.from([0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // Actor Unique Id, the sender
            Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]) // Fire At Position
        ]);
        const packet = new LevelSoundEventPacket(bytes);
        packet.decode();

        await new LevelSoundEventHandler().handle(packet, server, session);

        expect(played).toHaveLength(1);
        expect(played[0]!.packet).toBe(packet);
        expect(packet.getEncoded()).toBe(true);
        expect(packet.getBuffer()).toEqual(bytes);
    });
});
