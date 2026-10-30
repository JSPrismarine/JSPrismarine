import { describe, expect, it } from 'vitest';
import MobEquipmentPacket from './MobEquipmentPacket';

const air = { id: 0, stackSize: 0, auxValue: 0, stackNetId: null, blockRuntimeId: 0, userData: Buffer.alloc(0) };
const data = {
    runtimeEntityId: 300n,
    item: air,
    inventorySlot: 8,
    hotbarSlot: 8,
    windowId: 0
};

describe('MobEquipmentPacket', () => {
    it('writes the target, full item descriptor, and three slot fields in order', () => {
        const packet = new MobEquipmentPacket(data);
        packet.encode();

        expect([...packet.getBuffer()]).toEqual([0x1f, 0xac, 0x02, ...new Array<number>(8).fill(0), 8, 8, 0]);
    });

    it('reads every field from the packet', () => {
        const encoded = new MobEquipmentPacket(data);
        encoded.encode();
        const packet = new MobEquipmentPacket(null, encoded.getBuffer());
        packet.decode();

        expect(packet.getPacketData()).toEqual(data);
        expect(packet.feof()).toBe(true);
    });
});
