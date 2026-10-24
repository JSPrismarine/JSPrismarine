import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import AgentAnimationPacket, { AgentAnimation } from './AgentAnimationPacket';

import type { AgentAnimationData } from './AgentAnimationPacket';

const DATA: AgentAnimationData = {
    animation: AgentAnimation.SHRUG,
    runtimeId: 300n
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xb0, 0x02], // packet id header, 304 as a varuint32
    0x01, // Agent Animation Shrug, uint8
    ...[0xac, 0x02] // Runtime Id 300, varuint64
]);

describe('AgentAnimationPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new AgentAnimationPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new AgentAnimationPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
