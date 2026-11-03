import { describe, expect, it } from 'vitest';

import { InboundPacketTrace } from './InboundPacketTrace';

describe('InboundPacketTrace', () => {
    it('copies packet bytes and round trips its versioned serialized form', () => {
        const source = Buffer.from([0x09, 0xaa, 0xbb]);
        const trace = new InboundPacketTrace();
        trace.record({
            connectionId: 3,
            order: 0,
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
                order: 0,
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
            order: 0,
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

    it('rejects invalid JSON', () => {
        expect(() => InboundPacketTrace.deserialize(Buffer.from('{'))).toThrow('Invalid inbound packet trace JSON');
    });

    it.each([
        { description: 'an unsupported format', format: 'other-format', version: 1 },
        { description: 'an unsupported version', format: 'jsprismarine-inbound-packets', version: 3 }
    ])('rejects $description', ({ format, version }) => {
        const unsupported = Buffer.from(JSON.stringify({ format, version, records: [] }));

        expect(() => InboundPacketTrace.deserialize(unsupported)).toThrow(
            'Unsupported inbound packet trace format or version'
        );
    });

    it('rejects a trace whose records field is not an array', () => {
        const malformed = Buffer.from(
            JSON.stringify({ format: 'jsprismarine-inbound-packets', version: 1, records: {} })
        );

        expect(() => InboundPacketTrace.deserialize(malformed)).toThrow('Invalid inbound packet trace records');
    });

    it('assigns legacy trace records their serialized order', () => {
        const legacy = Buffer.from(
            JSON.stringify({
                format: 'jsprismarine-inbound-packets',
                version: 1,
                records: [
                    {
                        connectionId: 2,
                        sequence: 0,
                        tick: 4,
                        protocolVersion: 2193,
                        packetName: 'TextPacket',
                        payload: 'AQ=='
                    },
                    {
                        connectionId: 1,
                        sequence: 0,
                        tick: 4,
                        protocolVersion: 2193,
                        packetName: 'TextPacket',
                        payload: 'Ag=='
                    }
                ]
            })
        );

        const records = InboundPacketTrace.deserialize(legacy).records();

        expect(records.map(({ connectionId, order }) => [connectionId, order])).toEqual([
            [2, 0],
            [1, 1]
        ]);
    });

    it('rejects a version two trace whose global order repeats', () => {
        const malformed = Buffer.from(
            JSON.stringify({
                format: 'jsprismarine-inbound-packets',
                version: 2,
                records: [
                    {
                        connectionId: 1,
                        order: 0,
                        sequence: 0,
                        tick: 0,
                        protocolVersion: 2193,
                        packetName: 'A',
                        payload: ''
                    },
                    {
                        connectionId: 2,
                        order: 0,
                        sequence: 0,
                        tick: 0,
                        protocolVersion: 2193,
                        packetName: 'B',
                        payload: ''
                    }
                ]
            })
        );

        expect(() => InboundPacketTrace.deserialize(malformed)).toThrow('Invalid inbound packet trace record');
    });
});
