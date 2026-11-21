import { describe, expect, it } from 'vitest';

import PositionTrackingDBClientRequestPacket, {
    PositionTrackingDBClientRequestAction
} from './PositionTrackingDBClientRequestPacket';

// Packet id 154 as a varuint.
const HEADER = [0x9a, 0x01];

describe('PositionTrackingDBClientRequestPacket', () => {
    it('writes the action as a uint8 and the tracking id as a ZigZag varint32', () => {
        const packet = new PositionTrackingDBClientRequestPacket();
        packet.id = 7;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, 0x00, 0x0e]));
    });

    it('reads the action and a negative tracking id, consuming the whole buffer', () => {
        const packet = new PositionTrackingDBClientRequestPacket();
        packet.setReadBuffer(Buffer.from([...HEADER, 0x00, 0x03]));
        packet.decode();

        expect(packet.action).toBe(PositionTrackingDBClientRequestAction.Query);
        expect(packet.id).toBe(-2);
        expect(packet.feof()).toBe(true);
    });
});
