import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import AgentActionEventPacket, { AgentActionType } from './AgentActionEventPacket';

import type { AgentActionEvent } from './AgentActionEventPacket';
import { enumDumpMembers } from '../testing/evidence.test.helper';

const DATA: AgentActionEvent = {
    requestId: 'req-1',
    action: AgentActionType.TURN,
    response: '{"ok":true}'
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xb5, 0x01], // packet id header, 181 as a varuint32
    ...[0x05, ...Buffer.from('req-1', 'utf8')], // Request Id "req-1", 5 bytes
    ...[0x12, 0x00, 0x00, 0x00], // Action Turn (18), little-endian int32
    ...[0x0b, ...Buffer.from('{"ok":true}', 'utf8')] // Response JSON text, 11 bytes
]);

/** The first member of the enum, which pins that the numbering starts at 1 and not 0. */
const ATTACK: AgentActionEvent = {
    requestId: '',
    action: AgentActionType.ATTACK,
    response: ''
};

/** `ATTACK` on the wire: the header, an empty request id, 1 as int32, an empty response. */
const ATTACK_BYTES = Buffer.from([0xb5, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);

describe('AgentActionEventPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new AgentActionEventPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new AgentActionEventPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes Attack as 1, the first value the client knows', () => {
        const buffer = new AgentActionEventPacket(ATTACK).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...ATTACK_BYTES]);
    });

    it('reads Attack back from a 1', () => {
        const stream = new NetworkBinaryStream(ATTACK_BYTES);
        const data = new AgentActionEventPacket().deserialize(stream);

        expect(data).toEqual(ATTACK);
        expect(stream.feof()).toBe(true);
    });

    it('numbers AgentActionType as the pinned Mojang enums.html does, from 1 at every protocol', () => {
        // The pinned 1.26.40 enums.html that datagen keeps, which Mojang generated from the game.
        // No Bedrock Dedicated Server capture of this packet exists, so this is the executable
        // evidence for numbering from 1 where the 1.26.50 docs page lists 0.
        const values = enumDumpMembers('AgentActionType').map(({ name, value }) => [name, value] as const);
        const compact = (name: string): string => name.replaceAll('_', '').toLowerCase();
        const ours = Object.entries(AgentActionType)
            .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
            .map(([name, value]) => [compact(name), value] as const);

        expect(values.length).toBeGreaterThan(0);
        expect(values.map(([name, value]) => [compact(name), value])).toEqual(ours);
    });

    it('writes the same bytes at 2193 and 2225, which differ in no field', () => {
        const at = (protocol: number): number[] => {
            const packet = new AgentActionEventPacket(DATA);
            packet.codecProtocol = protocol;
            return [...packet.serialize(new NetworkBinaryStream())];
        };

        expect(at(2225)).toEqual(at(2193));
    });
});
