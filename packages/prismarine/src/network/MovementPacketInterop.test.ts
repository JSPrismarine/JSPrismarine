import { LevelChunkPacket, MovePlayerPacket, PositionMode, NetworkBinaryStream } from '@jsprismarine/protocol';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';
import ServerLevelChunkPacket from './packet/LevelChunkPacket';
import ServerMovePlayerPacket from './packet/MovePlayerPacket';

import type { NetworkPacket } from '@jsprismarine/protocol';

/**
 * The second batch of migrated packets, pinned against the server's own classes.
 *
 * Same bargain as `BatchCodecInterop.test.ts`: the two implementations will coexist for as
 * long as the migration takes, so a disagreement between them is a client that moves
 * somewhere the server does not think it moved. These are the packets a bot uses, and a bot
 * that silently mis-encodes its position is worse than one that does not move at all -
 * it produces a load test whose numbers mean nothing.
 */

const encode = (packet: NetworkPacket<any>): Buffer => packet.serialize(new NetworkBinaryStream());

describe('MovePlayer', () => {
    const data = {
        runtimeEntityId: 42n,
        position: { x: 1.5, y: 64.25, z: -3.75 },
        pitch: 12.5,
        yaw: -45,
        headYaw: 30,
        mode: PositionMode.Normal,
        onGround: true,
        ridingEntityRuntimeId: 0n,
        tick: 1234n
    };

    it('encodes exactly what the server decodes', () => {
        const server = new ServerMovePlayerPacket(encode(new MovePlayerPacket(data)));
        server.decode();

        expect(server.runtimeEntityId).toBe(data.runtimeEntityId);
        expect(server.position.getX()).toBeCloseTo(data.position.x, 3);
        expect(server.position.getY()).toBeCloseTo(data.position.y, 3);
        expect(server.position.getZ()).toBeCloseTo(data.position.z, 3);
        expect(server.yaw).toBeCloseTo(data.yaw, 3);
        expect(server.onGround).toBe(true);
        expect(server.tick).toBe(data.tick);
    });

    it('produces byte-identical output to the server encoder', () => {
        const server = new ServerMovePlayerPacket();
        server.runtimeEntityId = data.runtimeEntityId;
        server.position = new Vector3(data.position.x, data.position.y, data.position.z);
        server.pitch = data.pitch;
        server.yaw = data.yaw;
        server.headYaw = data.headYaw;
        server.mode = data.mode;
        server.onGround = data.onGround;
        server.ridingEntityRuntimeId = data.ridingEntityRuntimeId;
        server.tick = data.tick;
        server.encode();

        expect(encode(new MovePlayerPacket(data))).toEqual(server.getBuffer());
    });

    it('carries the teleport fields only when the move is a teleport', () => {
        // The packet's length depends on one of its own bytes. Read them unconditionally and
        // the tick comes out as whatever the next four bytes happened to be.
        const teleport = { ...data, mode: PositionMode.Teleport, teleportCause: 3, teleportItemId: 7 };

        const withTeleport = encode(new MovePlayerPacket(teleport));
        const without = encode(new MovePlayerPacket(data));
        expect(withTeleport.byteLength).toBe(without.byteLength + 8);

        const decoded = new MovePlayerPacket().deserialize(new NetworkBinaryStream(withTeleport));
        expect(decoded.teleportCause).toBe(3);
        expect(decoded.tick).toBe(data.tick);

        expect(new MovePlayerPacket().deserialize(new NetworkBinaryStream(without))).not.toHaveProperty(
            'teleportCause'
        );
    });
});

describe('LevelChunk', () => {
    it('reads the envelope the server writes and leaves the terrain alone', () => {
        const payload = Buffer.alloc(4096, 0x2a);

        const server = new ServerLevelChunkPacket();
        server.chunkX = -3;
        server.chunkZ = 7;
        server.subChunkCount = 5;
        server.clientSubChunkRequestsEnabled = false;
        server.data = payload;
        server.encode();

        const decoded = new LevelChunkPacket().deserialize(new NetworkBinaryStream(server.getBuffer()));

        expect(decoded.chunkX).toBe(-3);
        expect(decoded.chunkZ).toBe(7);
        expect(decoded.subChunkCount).toBe(5);
        expect(decoded.clientSubChunkRequestsEnabled).toBe(false);
        // Not parsed, just handed over - which is the whole point for a load test.
        expect(decoded.payload.equals(payload)).toBe(true);
    });

    it('recognizes the sub chunk request sentinel rather than reading it as a count', () => {
        const server = new ServerLevelChunkPacket();
        server.chunkX = 0;
        server.chunkZ = 0;
        server.subChunkCount = 9;
        server.clientSubChunkRequestsEnabled = true;
        server.data = Buffer.alloc(8);
        server.encode();

        const decoded = new LevelChunkPacket().deserialize(new NetworkBinaryStream(server.getBuffer()));

        expect(decoded.clientSubChunkRequestsEnabled).toBe(true);
        expect(decoded.subChunkCount).toBe(9);
    });
});
