import { describe, expect, it } from 'vitest';
import NpcRequestPacket, { NpcRequestType } from './NpcRequestPacket';

describe('NpcRequestPacket', () => {
    // One Buffer per docs field, in wire order.
    const encoded = Buffer.concat([
        Buffer.from([0x62]), // Header, packet 98
        Buffer.from([0x80, 0x01]), // NPC Runtime ID: varuint64 128
        Buffer.from([0x01]), // Request Type: ExecuteAction
        Buffer.from([0x02]),
        Buffer.from('[]'), // Actions
        Buffer.from([0x02]), // Action Index
        Buffer.from([0x05]),
        Buffer.from('scene') // Scene Name
    ]);

    it('decodes every field and consumes the whole buffer', () => {
        const packet = new NpcRequestPacket(encoded);
        packet.decode();

        expect(packet.npcRuntimeId).toBe(128n);
        expect(packet.requestType).toBe(NpcRequestType.ExecuteAction);
        expect(packet.actions).toBe('[]');
        expect(packet.actionIndex).toBe(2);
        expect(packet.sceneName).toBe('scene');
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        const packet = new NpcRequestPacket();
        packet.npcRuntimeId = 128n;
        packet.requestType = NpcRequestType.ExecuteAction;
        packet.actions = '[]';
        packet.actionIndex = 2;
        packet.sceneName = 'scene';
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
