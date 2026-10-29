import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { stub } from '../../testing/stub.test.helper';
import SetPlayerFurnaceOptionsHandler from '../handler/SetPlayerFurnaceOptionsHandler';
import PacketRegistry from '../PacketRegistry';
import SetPlayerFurnaceOptionsPacket, {
    FurnaceLayout,
    FurnaceLeftTabIndex,
    FurnaceType
} from './SetPlayerFurnaceOptionsPacket';

/** A smoker with the search tab open, filtering on and the default layout, in the docs' field order. */
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
        const packet = new SetPlayerFurnaceOptionsPacket();
        packet.furnaceType = FurnaceType.Smoker;
        packet.leftTab = FurnaceLeftTabIndex.RecipeSearch;
        packet.filtering = true;
        packet.layout = FurnaceLayout.Default;
        packet.encode();

        expect([...packet.getBuffer()]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const packet = new SetPlayerFurnaceOptionsPacket(BYTES);
        packet.decode();

        expect(packet.furnaceType).toBe(FurnaceType.Smoker);
        expect(packet.leftTab).toBe(FurnaceLeftTabIndex.RecipeSearch);
        expect(packet.filtering).toBe(true);
        expect(packet.layout).toBe(FurnaceLayout.Default);
        expect(packet.feof()).toBe(true);
    });

    it('reads every option at None to the end of the buffer', () => {
        const packet = new SetPlayerFurnaceOptionsPacket(NONE_BYTES);
        packet.decode();

        expect(packet.furnaceType).toBe(FurnaceType.None);
        expect(packet.leftTab).toBe(FurnaceLeftTabIndex.None);
        expect(packet.filtering).toBe(false);
        expect(packet.layout).toBe(FurnaceLayout.None);
        expect(packet.feof()).toBe(true);
    });

    it('resolves 0x15f to a packet and a handler in the registry', async () => {
        const registry = new PacketRegistry({ getLogger: () => stub<Logger>({ debug: () => {}, verbose: () => {} }) });
        await registry['registerPackets']();
        await registry['registerHandlers']();

        expect(registry.getPackets().get(0x15f)).toBe(SetPlayerFurnaceOptionsPacket);
        expect(registry.getHandler('SetPlayerFurnaceOptionsPacket')).toBeInstanceOf(SetPlayerFurnaceOptionsHandler);
    });
});
