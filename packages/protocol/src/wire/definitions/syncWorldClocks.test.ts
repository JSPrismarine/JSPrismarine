import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../../NetworkBinaryStream';
import SyncWorldClocksPacket, { SyncWorldClocksDataType } from '../../packet/SyncWorldClocksPacket';
import { layoutAt } from '../WireLayout';
import { syncWorldClocksPacket } from './syncWorldClocks';

import type { SyncWorldClocksPayload } from './syncWorldClocks';

/** A serialized packet without its id header, which is what the layout describes. */
const bodyOf = (buffer: Buffer): Buffer => {
    const stream = new BinaryStream(buffer);
    stream.readUnsignedVarInt();
    return stream.readRemaining();
};

const marker = { id: 7n, name: 'noon', time: -12, period: 24000 };

const payloads: Record<string, SyncWorldClocksPayload> = {
    'a state sync': {
        data: {
            type: SyncWorldClocksDataType.SyncState,
            clocks: [{ clockId: 1234567890123n, time: 13, isPaused: true }]
        }
    },
    'a registry': {
        data: {
            type: SyncWorldClocksDataType.InitializeRegistry,
            clocks: [{ id: 9n, name: 'overworld', time: 100, isPaused: false, timeMarkers: [marker] }]
        }
    },
    'added markers': { data: { type: SyncWorldClocksDataType.AddTimeMarker, clockId: 9n, timeMarkers: [marker] } },
    'removed markers': {
        data: { type: SyncWorldClocksDataType.RemoveTimeMarker, clockId: 9n, timeMarkerIds: [7n, 8n] }
    }
};

describe('the declarative SyncWorldClocks layout', () => {
    for (const [name, payload] of Object.entries(payloads)) {
        it(`writes the bytes the packet class writes for ${name}`, () => {
            const classBytes = bodyOf(new SyncWorldClocksPacket(payload).serialize(new NetworkBinaryStream()));
            const stream = new BinaryStream();
            layoutAt(syncWorldClocksPacket, 2225).encode(stream, payload);

            expect(stream.getBuffer()).toEqual(classBytes);
        });

        it(`reads back ${name} and consumes the whole payload`, () => {
            const stream = new BinaryStream();
            layoutAt(syncWorldClocksPacket, 2193).encode(stream, payload);
            const read = new BinaryStream(stream.getBuffer());

            expect(layoutAt(syncWorldClocksPacket, 2193).decode(read)).toEqual(payload);
            expect(read.feof()).toBe(true);
        });
    }

    it('rejects a selector no alternative has', () => {
        expect(() => layoutAt(syncWorldClocksPacket, 2225).decode(new BinaryStream(Buffer.from([9])))).toThrow(
            'Unknown SyncWorldClocksPacket data type 9'
        );
    });
});
