import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import SetHudPacket, { HudElement, HudVisibility } from './SetHudPacket';

import type { SetHud } from './SetHudPacket';

const DATA: SetHud = {
    elements: [HudElement.Armor, HudElement.Hunger, HudElement.ItemText],
    visibility: HudVisibility.Reset
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xb4, 0x02], // packet id 308 as a varuint32 header
    0x03, // Hud Element count, a varuint32
    0x02, // Armor (1), a ZigZag varint32
    0x10, // Hunger (8), a ZigZag varint32
    0x18, // ItemText (12), a ZigZag varint32
    0x02 // Hud Visible: Reset (1), a ZigZag varint32
]);

/** Hiding nothing: the header, a zero count, Hide. */
const NO_ELEMENTS: SetHud = { elements: [], visibility: HudVisibility.Hide };

const NO_ELEMENTS_BYTES = Buffer.from([0xb4, 0x02, 0x00, 0x00]);

describe('SetHudPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new SetHudPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new SetHudPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes an empty element list as a zero count', () => {
        const buffer = new SetHudPacket(NO_ELEMENTS).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...NO_ELEMENTS_BYTES]);
    });

    it('reads an empty element list to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(NO_ELEMENTS_BYTES);
        const data = new SetHudPacket().deserialize(stream);

        expect(data).toEqual(NO_ELEMENTS);
        expect(stream.feof()).toBe(true);
    });
});
