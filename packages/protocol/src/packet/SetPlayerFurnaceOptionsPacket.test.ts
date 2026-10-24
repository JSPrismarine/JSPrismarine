import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import SetPlayerFurnaceOptionsPacket, {
    FurnaceLayout,
    FurnaceLeftTabIndex,
    FurnaceType
} from './SetPlayerFurnaceOptionsPacket';

import type { SetPlayerFurnaceOptions } from './SetPlayerFurnaceOptionsPacket';

const DATA: SetPlayerFurnaceOptions = {
    furnaceType: FurnaceType.Smoker,
    options: {
        leftTab: FurnaceLeftTabIndex.RecipeSearch,
        filtering: true,
        layout: FurnaceLayout.Default
    }
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xdf, 0x02], // packet id header: 351 as a varuint32
    0x03, // FurnaceType: Smoker, one byte
    0x08, // Left Furnace Tab: RecipeSearch (4), ZigZag varint32
    0x01, // Filtering
    0x04 // Layout: Default (2), ZigZag varint32
]);

/** Every option at None: the header and four zero bytes. */
const NONE_BYTES = Buffer.from([0xdf, 0x02, 0x00, 0x00, 0x00, 0x00]);

describe('SetPlayerFurnaceOptionsPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new SetPlayerFurnaceOptionsPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new SetPlayerFurnaceOptionsPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('reads every option at None to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(NONE_BYTES);

        expect(new SetPlayerFurnaceOptionsPacket().deserialize(stream)).toEqual({
            furnaceType: FurnaceType.None,
            options: { leftTab: FurnaceLeftTabIndex.None, filtering: false, layout: FurnaceLayout.None }
        });
        expect(stream.feof()).toBe(true);
    });
});
