import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';
import { packetIds as packetIds2193 } from '../wire/versions/v2193';
import { packetIds as packetIds2225 } from '../wire/versions/v2225';
import { layoutAt } from '../wire/WireLayout';
import { serverboundMatchmakingCancelPacket } from '../wire/definitions/added2225';

describe.each([2193, 2225])('the declarative ServerboundMatchmakingCancel layout at protocol %i', (protocol) => {
    const layout = layoutAt(serverboundMatchmakingCancelPacket, protocol);

    it('writes no payload bytes', () => {
        const stream = new BinaryStream();
        layout.encode(stream, {});

        expect(stream.getWriteIndex()).toBe(0);
    });

    it('reads an empty payload without consuming anything', () => {
        const stream = new BinaryStream(Buffer.from('ff', 'hex'));

        expect(layout.decode(stream)).toEqual({});
        expect(stream.getReadIndex()).toBe(0);
    });
});

describe('the ServerboundMatchmakingCancel packet id', () => {
    it('is 356 at protocol 2225, where the packet was added', () => {
        expect(packetIds2225.ServerboundMatchmakingCancelPacket).toBe(356);
    });

    it('is absent at protocol 2193', () => {
        expect(packetIds2193).not.toHaveProperty('ServerboundMatchmakingCancelPacket');
    });
});
