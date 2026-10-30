import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import GuiDataPickItemPacket from './GuiDataPickItemPacket';

import type { GuiDataPickItem } from './GuiDataPickItemPacket';

const DATA: GuiDataPickItem = { itemName: 'stone', itemEffectName: '', slot: 4 };
const BYTES = Buffer.from([0x36, 0x05, 0x73, 0x74, 0x6f, 0x6e, 0x65, 0x00, 0x04, 0x00, 0x00, 0x00]);

describe('GuiDataPickItemPacket', () => {
    it('writes both popup lines and the hover slot', () => {
        const buffer = new GuiDataPickItemPacket(DATA).serialize(new NetworkBinaryStream());

        expect(buffer).toEqual(BYTES);
    });

    it('reads a hand-built popup to the end of the packet', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new GuiDataPickItemPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
