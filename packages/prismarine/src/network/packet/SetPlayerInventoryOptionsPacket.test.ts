import { describe, expect, it } from 'vitest';
import SetPlayerInventoryOptionsPacket, {
    InventoryLayout,
    InventoryLeftTab,
    InventoryRightTab
} from './SetPlayerInventoryOptionsPacket';

describe('SetPlayerInventoryOptionsPacket', () => {
    // Header: id 307 is 0xb3 0x02. Left tab 5 zigzags to 0x0a, right tab 2 to 0x04, filtering is
    // one byte, inventory layout 2 is 0x04 and crafting layout 3 is 0x06.
    const encoded = Buffer.from([0xb3, 0x02, 0x0a, 0x04, 0x01, 0x04, 0x06]);

    it('decodes the five options, consuming the whole buffer', () => {
        const packet = new SetPlayerInventoryOptionsPacket(encoded);
        packet.decode();

        expect(packet.leftTab).toBe(InventoryLeftTab.RECIPE_SEARCH);
        expect(packet.rightTab).toBe(InventoryRightTab.CRAFTING);
        expect(packet.filtering).toBe(true);
        expect(packet.inventoryLayout).toBe(InventoryLayout.DEFAULT);
        expect(packet.craftingLayout).toBe(InventoryLayout.RECIPE_BOOK_ONLY);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        const packet = new SetPlayerInventoryOptionsPacket();
        packet.leftTab = InventoryLeftTab.RECIPE_SEARCH;
        packet.rightTab = InventoryRightTab.CRAFTING;
        packet.filtering = true;
        packet.inventoryLayout = InventoryLayout.DEFAULT;
        packet.craftingLayout = InventoryLayout.RECIPE_BOOK_ONLY;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
