import { describe, expect, it } from 'vitest';

import type { JavaPacketDefinition } from './JavaPacket';
import { decodeJavaPacket, encodeJavaPacket, readJavaPacketId } from './JavaPacket';
import {
    ChunkBatchFinished,
    GameEvent,
    PlayLogin,
    SetCenterChunk,
    START_WAITING_FOR_LEVEL_CHUNKS,
    SynchronizePlayerPosition
} from './play';

/** What the vanilla 26.3 server sent an offline player joining its flat world, without packet ids. */
const VANILLA = {
    login: '0000001f0003136d696e6563726166743a6f766572776f726c64116d696e6563726166743a7468655f656e64146d696e6563726166743a7468655f6e6574686572140a0a00010000136d696e6563726166743a6f766572776f726c64fa088e06aedc5c04000000010000c1ffffff0f0000',
    position:
        '014025000000000000c04e000000000000bfe0000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    gameEvent: '0d00000000',
    center: '00ffffffff0f',
    batchFinished: '09'
};

/** Reads `hex` as `definition`, and checks that writing the result gives the same bytes. */
const readBack = <T>(definition: JavaPacketDefinition<T>, hex: string): T => {
    const frame = Buffer.concat([idOf(definition), Buffer.from(hex, 'hex')]);
    const value = decodeJavaPacket(definition, readJavaPacketId(frame).body);
    expect(encodeJavaPacket(definition, value)).toEqual(frame);
    return value;
};

/** A packet id as the VarInt that starts a frame. */
const idOf = (definition: JavaPacketDefinition<unknown>): Buffer => {
    const bytes: number[] = [];
    let id = definition.id;
    do {
        bytes.push((id & 0x7f) | (id > 0x7f ? 0x80 : 0));
        id >>>= 7;
    } while (id !== 0);
    return Buffer.from(bytes);
};

describe('play packets against vanilla 26.3', () => {
    it('reads the login vanilla sends a survival player in its flat overworld, and writes it back', () => {
        expect(readBack(PlayLogin, VANILLA.login)).toMatchObject({
            entityId: 31,
            dimensions: ['minecraft:overworld', 'minecraft:the_end', 'minecraft:the_nether'],
            maxPlayers: 20,
            viewDistance: 10,
            dimensionType: 0,
            dimension: 'minecraft:overworld',
            gameMode: 0,
            previousGameMode: null,
            isFlat: true,
            deathLocation: null,
            seaLevel: -63,
            onlineMode: false,
            enforcesSecureChat: false
        });
    });

    it('reads the spawn position and the chunk the view centers on', () => {
        expect(readBack(SynchronizePlayerPosition, VANILLA.position)).toMatchObject({
            teleportId: 1,
            x: 10.5,
            y: -60,
            z: -0.5,
            flags: 0
        });
        expect(readBack(SetCenterChunk, VANILLA.center)).toEqual({ x: 0, z: -1 });
        expect(readBack(GameEvent, VANILLA.gameEvent)).toEqual({ event: START_WAITING_FOR_LEVEL_CHUNKS, value: 0 });
        expect(readBack(ChunkBatchFinished, VANILLA.batchFinished)).toEqual({ batchSize: 9 });
    });
});
