import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { LevelSoundEvent } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type { NetworkWorldReplicator, WorldReplicators } from '../NetworkWorldReplicator';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type { StubMembers } from '../../testing/stub.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import LevelSoundEventPacket from '@jsprismarine/protocol/packet/LevelSoundEventPacket';
import LevelSoundEventHandler from './LevelSoundEventHandler';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { inputContext } from '../../testing/handlerContext.test.helper';

const SENDER_ID = 7n;

/** A sender at the origin, and a replicator that records what it was asked to play and where. */
const fakeSession = () => {
    const played: { position: Vector3; packet: NetworkPacket }[] = [];
    const world = stub<World>({});
    const player = stubPlayerPort({ getPosition: () => new Position(0, 64, 0, world) });

    const replicator = stub<NetworkWorldReplicator>({
        sendAround: (position, packet) => void played.push({ position, packet })
    });
    const session = stub<PlayerSession>({
        runtimeId: SENDER_ID,
        identity: identityNamed('tester'),
        getPlayer: () => player,
        getWorld: () => world
    });
    const { context } = inputContext(session, {
        log: stub<Logger>({ verbose: () => {} }),
        services: { replicators: stub<WorldReplicators>({ for: () => replicator }) }
    });

    return { played, context };
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
    it('relays a sound the sender is standing next to', () => {
        const { played, context } = fakeSession();

        new LevelSoundEventHandler().handle(soundAt(2, 64, 1), context);

        expect(played.map(({ position }) => position)).toEqual([new Vector3(2, 64, 1)]);
    });

    it('relays a sound the sender attributes to itself', () => {
        const { played, context } = fakeSession();

        new LevelSoundEventHandler().handle(
            soundAt(0, 64, 0, { entityUniqueId: SENDER_ID, entityType: 'minecraft:player' }),
            context
        );

        expect(played).toHaveLength(1);
    });

    it('drops a sound reported from somewhere the sender is not', () => {
        const { played, context } = fakeSession();

        new LevelSoundEventHandler().handle(soundAt(5000, 64, -5000), context);

        expect(played).toEqual([]);
    });

    it('drops a sound attributed to another actor', () => {
        const { played, context } = fakeSession();

        new LevelSoundEventHandler().handle(soundAt(0, 64, 0, { entityUniqueId: 99n }), context);

        expect(played).toEqual([]);
    });

    it('drops a sound attributed to another kind of actor', () => {
        const { played, context } = fakeSession();

        new LevelSoundEventHandler().handle(soundAt(0, 64, 0, { entityType: 'minecraft:zombie' }), context);

        expect(played).toEqual([]);
    });

    it('relays the packet the client sent, already encoded, so its bytes go out unchanged', () => {
        const { played, context } = fakeSession();
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

        new LevelSoundEventHandler().handle(packet, context);

        expect(played).toHaveLength(1);
        expect(played[0]!.packet).toBe(packet);
        expect(packet.getEncoded()).toBe(true);
        expect(packet.getBuffer()).toEqual(bytes);
    });
});
