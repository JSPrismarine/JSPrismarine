import {
    ChunkRadiusUpdatedPacket,
    LevelChunkPacket,
    MovePlayerPacket,
    MovementType,
    NetworkBinaryStream,
    PlayerActionPacket,
    PlayerActionType,
    RequestChunkRadiusPacket
} from '@jsprismarine/protocol';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';
import BlockPosition from '../world/BlockPosition';
import ServerChunkRadiusUpdatedPacket from './packet/ChunkRadiusUpdatedPacket';
import ServerLevelChunkPacket from './packet/LevelChunkPacket';
import ServerMovePlayerPacket from './packet/MovePlayerPacket';
import ServerPlayerActionPacket from './packet/PlayerActionPacket';
import ServerRequestChunkRadiusPacket from './packet/RequestChunkRadiusPacket';

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
        mode: MovementType.Normal,
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
        const teleport = { ...data, mode: MovementType.Teleport, teleportCause: 3, teleportItemId: 7 };

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

describe('PlayerAction', () => {
    const data = {
        runtimeEntityId: 42n,
        action: PlayerActionType.START_BREAK,
        blockPosition: { x: -12, y: 70, z: 34 },
        resultPosition: { x: -12, y: 70, z: 34 },
        blockFace: 1
    };

    it('encodes exactly what the server decodes', () => {
        const server = new ServerPlayerActionPacket(encode(new PlayerActionPacket(data)));
        server.decode();

        expect(server.runtimeEntityId).toBe(data.runtimeEntityId);
        expect(server.action).toBe(PlayerActionType.START_BREAK);
        expect(server.blockPosition.getX()).toBe(-12);
        expect(server.blockPosition.getY()).toBe(70);
        expect(server.blockPosition.getZ()).toBe(34);
        expect(server.blockFace).toBe(1);
    });

    it('produces byte-identical output to the server encoder', () => {
        const server = new ServerPlayerActionPacket();
        server.runtimeEntityId = data.runtimeEntityId;
        server.action = data.action;
        server.blockPosition = new BlockPosition(-12, 70, 34);
        server.resultPosition = new BlockPosition(-12, 70, 34);
        server.blockFace = data.blockFace;
        server.encode();

        expect(encode(new PlayerActionPacket(data))).toEqual(server.getBuffer());
    });

    it('writes y signed, which is what lets a block below sea level round-trip', () => {
        // Since 1.26.10 the position is an ordinary `BlockPos`, signed all the way through.
        // Written unsigned, as it was up to 1.26.0, a y of -40 is not encodable at all and a
        // y of 200 comes out as 100 on the other side, with the face read from its second byte.
        const deep = { ...data, blockPosition: { x: 0, y: -40, z: 0 }, resultPosition: { x: 0, y: 200, z: 0 } };
        const server = new ServerPlayerActionPacket(encode(new PlayerActionPacket(deep)));
        server.decode();

        expect(server.blockPosition.getY()).toBe(-40);
        expect(server.resultPosition.getY()).toBe(200);
        expect(server.blockFace).toBe(1);
    });
});

describe('chunk radius', () => {
    it('encodes a request the server decodes', () => {
        const server = new ServerRequestChunkRadiusPacket(
            encode(new RequestChunkRadiusPacket({ radius: 4, maxRadius: 12 }))
        );
        server.decode();

        expect(server.radius).toBe(4);
        expect(server.maxRadius).toBe(12);
    });

    it('decodes the answer the server encodes', () => {
        const server = new ServerChunkRadiusUpdatedPacket();
        server.radius = 8;
        server.encode();

        const decoded = new ChunkRadiusUpdatedPacket().deserialize(new NetworkBinaryStream(server.getBuffer()));
        expect(decoded.radius).toBe(8);
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

    it('recognises the sub chunk request sentinel rather than reading it as a count', () => {
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
