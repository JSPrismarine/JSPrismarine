import { PlayerRespawnState } from '@jsprismarine/minecraft';
import RespawnPacket from '@jsprismarine/protocol/bedrock/packet/RespawnPacket';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../testing/decodeView.test-utils';
import RespawnDecoder from './RespawnDecoder';

const respawn = (state: PlayerRespawnState, runtimeEntityId = 7n): RespawnPacket =>
    new RespawnPacket({ position: { x: 0, y: 0, z: 0 }, state, runtimeEntityId });

describe('RespawnDecoder', () => {
    it('decodes a ready-to-spawn about the sender', () => {
        const { view, logged } = decodeView();

        expect(new RespawnDecoder().decode(respawn(PlayerRespawnState.CLIENT_READY_TO_SPAWN), view)).toStrictEqual([
            { kind: 'respawn' }
        ]);
        expect(logged).toEqual([]);
    });

    it("ignores the states that are the server's to send", () => {
        const { view, logged } = decodeView();
        const decoder = new RespawnDecoder();

        expect(decoder.decode(respawn(PlayerRespawnState.SEARCHING_FOR_SPAWN), view)).toEqual([]);
        expect(decoder.decode(respawn(PlayerRespawnState.READY_TO_SPAWN), view)).toEqual([]);
        expect(logged).toEqual([]);
    });

    it('drops a respawn for another runtime id', () => {
        const { view, logged } = decodeView();

        expect(new RespawnDecoder().decode(respawn(PlayerRespawnState.CLIENT_READY_TO_SPAWN, 8n), view)).toEqual([]);
        expect(logged).toEqual(['tester sent a Respawn for runtime id 8, dropped']);
    });
});
