import { describe, expect, it } from 'vitest';
import BossEventPacket, { BossBarColor, BossBarOverlay, BossEventUpdateType } from './BossEventPacket';

describe('BossEventPacket', () => {
    // One Buffer per docs field, in wire order.
    const encoded = Buffer.concat([
        Buffer.from([0x4a]), // Header, packet 74
        Buffer.from([0x54]), // Target Actor ID: varint64 42 zigzags to 84
        Buffer.from([0x05]), // Event Type: Update_Name
        Buffer.from([0x04]),
        Buffer.from('Boss'), // Name
        Buffer.from([0x00]), // FilteredName: empty
        Buffer.from([0x00, 0x00, 0x00, 0x3f]), // Health Percent: float LE 0.5
        Buffer.from([0x02]), // Color: RED
        Buffer.from([0x01]) // Overlay: NOTCHED_6
    ]);

    it('decodes every field and consumes the whole buffer', () => {
        const packet = new BossEventPacket(encoded);
        packet.decode();

        expect(packet.targetActorId).toBe(42n);
        expect(packet.eventType).toBe(BossEventUpdateType.UpdateName);
        expect(packet.name).toBe('Boss');
        expect(packet.filteredName).toBe('');
        expect(packet.healthPercent).toBe(0.5);
        expect(packet.color).toBe(BossBarColor.Red);
        expect(packet.overlay).toBe(BossBarOverlay.Notched6);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        const packet = new BossEventPacket();
        packet.targetActorId = 42n;
        packet.eventType = BossEventUpdateType.UpdateName;
        packet.name = 'Boss';
        packet.healthPercent = 0.5;
        packet.color = BossBarColor.Red;
        packet.overlay = BossBarOverlay.Notched6;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
