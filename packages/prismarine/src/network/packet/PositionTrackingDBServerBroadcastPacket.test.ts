import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import PositionTrackingDBServerBroadcastPacket, {
    PositionTrackingDBServerBroadcastAction
} from './PositionTrackingDBServerBroadcastPacket';

// Packet id 153 as a varuint.
const HEADER = [0x99, 0x01];

// A network NBT compound holding version (byte) and id (string), with varint lengths and an
// empty root name.
const RECORD_BYTES = [
    0x0a,
    0x00, // TAG_Compound, name ""
    0x01,
    0x07,
    ...Buffer.from('version', 'utf8'),
    0x01, // TAG_Byte version = 1
    0x08,
    0x02,
    ...Buffer.from('id', 'utf8'),
    0x04,
    ...Buffer.from('lode', 'utf8'), // TAG_String id = "lode"
    0x00 // TAG_End
];

const record = (): NBTTagCompound => {
    const compound = new NBTTagCompound();
    compound.addValue('version', new Types.ByteVal(1));
    compound.addValue('id', new Types.StringVal('lode'));
    return compound;
};

describe('PositionTrackingDBServerBroadcastPacket', () => {
    it('writes the action, the tracking id and the record compound', () => {
        const packet = new PositionTrackingDBServerBroadcastPacket();
        packet.action = PositionTrackingDBServerBroadcastAction.Update;
        packet.id = 7;
        packet.positionTrackingData = record();
        packet.encode();

        // Action 0 as a uint8, then the tracking id 7 ZigZag encoded as 14.
        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, 0x00, 0x0e, ...RECORD_BYTES]));
    });

    it('reads the action, the tracking id and the record, consuming the whole buffer', () => {
        const packet = new PositionTrackingDBServerBroadcastPacket();
        packet.setReadBuffer(Buffer.from([...HEADER, 0x02, 0x0e, ...RECORD_BYTES]));
        packet.decode();

        expect(packet.action).toBe(PositionTrackingDBServerBroadcastAction.NotFound);
        expect(packet.id).toBe(7);
        expect(packet.positionTrackingData.getByte('version', 0)).toBe(1);
        expect(packet.positionTrackingData.getString('id', '')).toBe('lode');
        expect(packet.feof()).toBe(true);
    });

    it('writes an empty record as the three bytes of an empty compound', () => {
        const packet = new PositionTrackingDBServerBroadcastPacket();
        packet.encode();

        // Action NotFound, tracking id 0, then TAG_Compound, an empty name and TAG_End.
        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, 0x02, 0x00, 0x0a, 0x00, 0x00]));
    });
});
