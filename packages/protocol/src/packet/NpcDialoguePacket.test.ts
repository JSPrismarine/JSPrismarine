import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import NpcDialoguePacket, { NpcDialogueActionType } from './NpcDialoguePacket';

import type { NpcDialogue } from './NpcDialoguePacket';

const DATA: NpcDialogue = {
    npcId: 0x0102030405060708n,
    actionType: NpcDialogueActionType.Close,
    dialogue: 'Hi',
    sceneName: 'scene',
    npcName: 'Bob',
    actionJson: '[]'
};

/** `DATA` on the wire, header byte included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xa9, 0x01], // packet id header, 169 as a varuint32
    ...[0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01], // Npc Id Raw Id, little-endian uint64
    0x02, // Npc Dialogue Action Type, ZigZag varint32: Close (1) encodes as 2
    ...[0x02, 0x48, 0x69], // Dialogue "Hi"
    ...[0x05, 0x73, 0x63, 0x65, 0x6e, 0x65], // Scene Name "scene"
    ...[0x03, 0x42, 0x6f, 0x62], // Npc Name "Bob"
    ...[0x02, 0x5b, 0x5d] // Action JSON "[]"
]);

describe('NpcDialoguePacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new NpcDialoguePacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new NpcDialoguePacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips an open action with empty strings', () => {
        const open: NpcDialogue = {
            npcId: 0n,
            actionType: NpcDialogueActionType.Open,
            dialogue: '',
            sceneName: '',
            npcName: '',
            actionJson: ''
        };
        const buffer = new NpcDialoguePacket(open).serialize(new NetworkBinaryStream());
        const stream = new NetworkBinaryStream(buffer);

        expect(new NpcDialoguePacket().deserialize(stream)).toEqual(open);
        expect(stream.feof()).toBe(true);
    });
});
