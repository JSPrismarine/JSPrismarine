import { describe, expect, it } from 'vitest';
import ServerSettingsRequestPacket from './ServerSettingsRequestPacket';

describe('ServerSettingsRequestPacket', () => {
    it('decodes a header and nothing else', () => {
        // Header: id 102 is 0x66. The packet carries no fields.
        const packet = new ServerSettingsRequestPacket(Buffer.from([0x66]));
        packet.decode();

        expect(packet.feof()).toBe(true);
    });

    it('encodes to the header alone', () => {
        const packet = new ServerSettingsRequestPacket();
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x66]));
    });
});
