import { describe, expect, it } from 'vitest';
import { netIdFor } from '../codec/v2193';
import * as Packets from '../Packets';
import ModalFormRequestPacket from './ModalFormRequestPacket';

const ENCODED = Buffer.concat([
    Buffer.from([0x64]), // Header: id 100 as LEB128.
    Buffer.from([0xac, 0x02]), // Form ID 300 as a varuint32.
    Buffer.from([0x02, 0x7b, 0x7d]) // Form UI JSON "{}".
]);

describe('ModalFormRequestPacket', () => {
    it('encodes the form id as a varuint32 followed by the JSON', () => {
        const packet = Object.assign(new ModalFormRequestPacket(), { formId: 300, formUiJson: '{}' });
        packet.encode();

        expect(packet.getBuffer()).toEqual(ENCODED);
    });

    it('decodes both fields and consumes the whole buffer', () => {
        const packet = new ModalFormRequestPacket(ENCODED);
        packet.decode();

        expect(packet.formId).toBe(300);
        expect(packet.formUiJson).toBe('{}');
        expect(packet.feof()).toBe(true);
    });

    it('is registered for packet 0x64', () => {
        expect(Packets.ModalFormRequestPacket).toBe(ModalFormRequestPacket);
        expect(netIdFor('ModalFormRequestPacket')).toBe(0x64);
    });
});
