import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import TextType from '../type/TextType';
import TextPacket from './TextPacket';

// A varuint length prefix followed by UTF-8, for strings shorter than 128 bytes.
const string = (value: string): Buffer => Buffer.concat([Buffer.from([Buffer.byteLength(value)]), Buffer.from(value)]);

const message = '{"rawtext":[{"text":"Server restarts in 5 minutes"}]}';

// One Buffer per docs field, in wire order.
const wire = Buffer.concat([
    Buffer.from([0x09]), // header: varuint 9
    Buffer.from([0x00]), // Localize?: false
    Buffer.from([0x00]), // Body: MessageOnly
    Buffer.from([0x0b]), // Message Type: textObjectAnnouncement
    string(message), // Message
    string('2535428504464321'), // Sender's XUID
    string(''), // Platform Id
    Buffer.from([0x00]) // Filtered Message: absent
]);

describe('network', () => {
    describe('packet', () => {
        describe('TextPacket', () => {
            it('uses the network id the client expects', () => {
                expect(TextPacket.NetID).toBe(Identifiers.TextPacket);
                expect(TextPacket.NetID).toBe(9);
            });

            it('writes a textObjectAnnouncement as a MessageOnly body in docs order', () => {
                const pk = new TextPacket();
                pk.type = TextType.JsonAnnouncement;
                pk.needsTranslation = false;
                pk.message = message;
                pk.xuid = '2535428504464321';
                pk.platformChatId = '';
                pk.encode();

                expect(pk.getBuffer()).toEqual(wire);
            });

            it('reads a hand-built textObjectAnnouncement and consumes it all', () => {
                const pk = new TextPacket();
                pk.setReadBuffer(wire);
                pk.decode();

                expect(pk.type).toBe(TextType.JsonAnnouncement);
                expect(pk.needsTranslation).toBe(false);
                expect(pk.message).toBe(message);
                expect(pk.parameters).toEqual([]);
                expect(pk.xuid).toBe('2535428504464321');
                expect(pk.platformChatId).toBe('');
                expect(pk.filtered).toBe('');
                expect(pk.feof()).toBe(true);
            });
        });
    });
});
