import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type { Config } from '../config/Config';
import type { Entity } from '../entity/Entity';
import MoveActorAbsolutePacket from '@jsprismarine/protocol/packet/MoveActorAbsolutePacket';
import type { SessionPlayer } from './sessionPlayers';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import ClientConnection from './ClientConnection';
import { encodePacketBatch } from './encodePacketBatch';
import type { TransportConnection } from './transport/Transport';
import { sessionFor } from '../testing/playerSession.test.helper';
import Codec2193 from './codec/Codec2193';

describe('PlayerSession movement compression', () => {
    it('uses the server compression level when flushing queued movement', async () => {
        const configuredLevel = 1;
        const frames: Buffer[] = [];
        const connection = new ClientConnection(
            stub<TransportConnection>({
                id: 1,
                sendFrame: (frame) => void frames.push(frame),
                close: () => {}
            }),
            stub<Logger>({ isEnabled: () => false, silly: () => {}, error: () => {}, warn: () => {} }),
            undefined,
            () => configuredLevel
        );
        connection.codec = Codec2193;

        const config = stub<Config>({
            getEntityTrackingHysteresis: () => 2,
            getProximityBroadcast: () => true
        });
        const session = sessionFor(stub<Server>({ getConfig: () => config }), connection, stub<SessionPlayer>());
        const position = new Position(12, 64, -5, stub<World>());
        const entity = stub<Entity>({
            getRuntimeId: () => 300n,
            getPosition: () => position,
            pitch: 5,
            yaw: 10,
            headYaw: 20,
            isOnGround: () => true
        });

        session.queueMoveActor(entity);
        await session.flushQueuedMoves();

        const expected = new MoveActorAbsolutePacket();
        expected.runtimeEntityId = 300n;
        expected.position = position;
        expected.pitch = 5;
        expected.yaw = 10;
        expected.headYaw = 20;
        expected.flags = MoveActorAbsolutePacket.FLAG_ON_GROUND;
        expect(frames).toStrictEqual([
            encodePacketBatch([expected], Codec2193, { compressionLevel: configuredLevel }).content
        ]);
    });
});
