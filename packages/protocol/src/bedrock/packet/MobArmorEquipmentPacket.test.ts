import { describe, expect, it } from 'vitest';
import MobArmorEquipmentPacket from './MobArmorEquipmentPacket';

const air = { id: 0, stackSize: 0, auxValue: 0, stackNetId: null, blockRuntimeId: 0, userData: Buffer.alloc(0) };
const stack = (id: number, stackSize: number) => ({
    id,
    stackSize,
    auxValue: 0,
    stackNetId: null,
    blockRuntimeId: 0,
    userData: Buffer.alloc(10)
});

describe('MobArmorEquipmentPacket', () => {
    it('writes the target and all five positional armor slots', () => {
        const packet = new MobArmorEquipmentPacket({
            runtimeEntityId: 300n,
            head: stack(0x0141, 1),
            chest: air,
            legs: air,
            feet: stack(0x0200, 2),
            body: air
        });
        packet.encode();

        expect([...packet.getBuffer().subarray(0, 3)]).toEqual([0x20, 0xac, 0x02]);
        expect(packet.getBuffer().length).toBe(3 + 18 + 8 + 8 + 18 + 8);
    });

    it('reads each armor slot in positional order', () => {
        const data = {
            runtimeEntityId: 7n,
            head: air,
            chest: stack(0x0141, 1),
            legs: air,
            feet: air,
            body: stack(0x0200, 2)
        };
        const encoded = new MobArmorEquipmentPacket(data);
        encoded.encode();
        const packet = new MobArmorEquipmentPacket(null, encoded.getBuffer());
        packet.decode();

        expect(packet.getPacketData()).toEqual(data);
        expect(packet.feof()).toBe(true);
    });

    it.each([2193, 2225])('writes the same wire layout at protocol %i', (protocol) => {
        const data = {
            runtimeEntityId: 300n,
            head: stack(0x0141, 1),
            chest: air,
            legs: air,
            feet: stack(0x0200, 2),
            body: air
        };
        const encoded = new MobArmorEquipmentPacket(data);
        encoded.codecProtocol = protocol;
        encoded.encode();

        // Packet id 0x20, a varuint64 runtime id, then head, torso, legs, feet and body.
        expect([...encoded.getBuffer().subarray(0, 3)]).toEqual([0x20, 0xac, 0x02]);

        const decoded = new MobArmorEquipmentPacket(null, encoded.getBuffer());
        decoded.codecProtocol = protocol;
        decoded.decode();
        expect(decoded.getPacketData()).toEqual(data);
        expect(decoded.feof()).toBe(true);
    });
});
