import { describe, expect, it } from 'vitest';
import ModalFormResponsePacket, { ModalFormCancelReason } from './ModalFormResponsePacket';

describe('ModalFormResponsePacket', () => {
    it('decodes a submitted form as JSON present and no reason, consuming the whole buffer', () => {
        // Header 0x65. Form 300 is 0xac 0x02. Present, "[1]". Absent.
        const packet = new ModalFormResponsePacket(Buffer.from([0x65, 0xac, 0x02, 0x01, 0x03, 0x5b, 0x31, 0x5d, 0x00]));
        packet.decode();

        expect(packet.formId).toBe(300);
        expect(packet.jsonResponse).toBe('[1]');
        expect(packet.formCancelReason).toBeNull();
        expect(packet.feof()).toBe(true);
    });

    it('decodes a dismissed form as no JSON and a reason', () => {
        const packet = new ModalFormResponsePacket(Buffer.from([0x65, 0x01, 0x00, 0x01, 0x01]));
        packet.decode();

        expect(packet.formId).toBe(1);
        expect(packet.jsonResponse).toBeNull();
        expect(packet.formCancelReason).toBe(ModalFormCancelReason.UserBusy);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the presence bytes around each optional', () => {
        const packet = new ModalFormResponsePacket();
        packet.formId = 1;
        packet.formCancelReason = ModalFormCancelReason.UserClosed;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x65, 0x01, 0x00, 0x01, 0x00]));
    });
});
