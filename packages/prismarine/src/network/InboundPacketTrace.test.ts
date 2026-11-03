import { describe, expect, it } from 'vitest';

import { InboundPacketTrace } from './InboundPacketTrace';

describe('InboundPacketTrace', () => {
    it('copies packet bytes and round trips its versioned serialized form', () => {
        const source = Buffer.from([0x09, 0xaa, 0xbb]);
        const trace = new InboundPacketTrace();
        trace.record({
            connectionId: 3,
            sequence: 2,
            tick: 99,
            protocolVersion: 2225,
            packetName: 'TextPacket',
            payload: source
        });
        source.fill(0);

        const serialized = trace.serialize();
        const restored = InboundPacketTrace.deserialize(serialized);

        expect(restored.records()).toEqual([
            {
                connectionId: 3,
                sequence: 2,
                tick: 99,
                protocolVersion: 2225,
                packetName: 'TextPacket',
                payload: Buffer.from([0x09, 0xaa, 0xbb])
            }
        ]);
        expect(restored.getPayloadBytes()).toBe(3);
        expect(serialized.byteLength).toBeGreaterThan(3);
        expect(restored.packetDigestsByTick()).toEqual(trace.packetDigestsByTick());

        const changed = new InboundPacketTrace();
        changed.record({
            connectionId: 3,
            sequence: 2,
            tick: 99,
            protocolVersion: 2225,
            packetName: 'TextPacket',
            payload: Buffer.from([0x09, 0xaa, 0xbc])
        });
        expect(changed.packetDigestsByTick().get(99)).not.toBe(restored.packetDigestsByTick().get(99));
    });

    it('rejects a trace with a malformed packet record', () => {
        const malformed = Buffer.from(
            JSON.stringify({
                format: 'jsprismarine-inbound-packets',
                version: 1,
                records: [{ connectionId: 1, sequence: 0, payload: 'not base64!' }]
            })
        );

        expect(() => InboundPacketTrace.deserialize(malformed)).toThrow('Invalid inbound packet trace record');
    });
});
