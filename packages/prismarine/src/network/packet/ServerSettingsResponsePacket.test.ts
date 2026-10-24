import { describe, expect, it } from 'vitest';
import ServerSettingsResponsePacket from './ServerSettingsResponsePacket';

const ENCODED = Buffer.concat([
    Buffer.from([0x67]), // Header: id 103 as LEB128.
    Buffer.from([0xac, 0x02]), // Form ID 300 as a varuint32.
    Buffer.from([0x02, 0x7b, 0x7d]) // Form UI JSON "{}".
]);

describe('ServerSettingsResponsePacket', () => {
    it('encodes the form id as a varuint32 followed by the JSON', () => {
        const packet = Object.assign(new ServerSettingsResponsePacket(), { formId: 300, formUiJson: '{}' });
        packet.encode();

        expect(packet.getBuffer()).toEqual(ENCODED);
    });

    it('decodes both fields and consumes the whole buffer', () => {
        const packet = new ServerSettingsResponsePacket(ENCODED);
        packet.decode();

        expect(packet.formId).toBe(300);
        expect(packet.formUiJson).toBe('{}');
        expect(packet.feof()).toBe(true);
    });
});
