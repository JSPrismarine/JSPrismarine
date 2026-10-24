import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import TextPacket, { TextType } from './TextPacket';

import type { Text } from './TextPacket';

/** The header: packet id 9 as a varuint, no subclient ids. */
const HEADER = 0x09;

/** A string as the wire carries it: a varuint length, then the UTF-8 bytes. One length byte for these. */
const str = (text: string): number[] => [text.length, ...Buffer.from(text, 'utf-8')];

const encode = (data: Text): Buffer => new TextPacket(data).serialize(new NetworkBinaryStream());

const raw: Text = {
    type: TextType.Raw,
    needsTranslation: false,
    message: 'hi',
    xuid: '',
    platformChatId: '',
    filtered: ''
};

const chat: Text = {
    type: TextType.Chat,
    needsTranslation: false,
    sourceName: 'Steve',
    message: 'hi',
    xuid: '2535',
    platformChatId: 'p1',
    filtered: 'hi'
};

const translation: Text = {
    type: TextType.Translation,
    needsTranslation: true,
    message: '%a',
    parameters: ['x', 'yz'],
    xuid: '',
    platformChatId: '',
    filtered: ''
};

describe('TextPacket', () => {
    describe('serialize', () => {
        it('writes a Raw message as body variant 0, type after the variant index', () => {
            expect([...encode(raw)]).toEqual([
                HEADER,
                0x00, // Localize?
                0x00, // Body variant: MessageOnly
                0x00, // Message Type: raw
                ...str('hi'), // Message
                ...str(''), // Sender's XUID
                ...str(''), // Platform Id
                0x00 // Filtered Message: absent
            ]);
        });

        it('writes a Chat message as body variant 1 with the Player Name before the Message', () => {
            expect([...encode(chat)]).toEqual([
                HEADER,
                0x00, // Localize?
                0x01, // Body variant: AuthorAndMessage
                0x01, // Message Type: chat
                ...str('Steve'), // Player Name
                ...str('hi'), // Message
                ...str('2535'), // Sender's XUID
                ...str('p1'), // Platform Id
                0x01, // Filtered Message: present
                ...str('hi')
            ]);
        });

        it('writes a Translation as body variant 2 with the Parameter List after the Message', () => {
            expect([...encode(translation)]).toEqual([
                HEADER,
                0x01, // Localize?
                0x02, // Body variant: MessageAndParams
                0x02, // Message Type: translate
                ...str('%a'), // Message
                0x02, // Parameter List count
                ...str('x'),
                ...str('yz'),
                ...str(''), // Sender's XUID
                ...str(''), // Platform Id
                0x00 // Filtered Message: absent
            ]);
        });

        it('writes the Filtered Message as an optional: a presence byte, then the string only when present', () => {
            const absent = encode({ ...raw, type: TextType.System, message: 'm' });
            const present = encode({ ...raw, type: TextType.System, message: 'm', filtered: 'f' });

            expect([...absent.subarray(-1)]).toEqual([0x00]);
            expect([...present.subarray(-3)]).toEqual([0x01, ...str('f')]);
            expect(present.length).toBe(absent.length + 2);
        });

        it('writes every message-only type, textObjectAnnouncement included, as body variant 0', () => {
            const types = [
                TextType.Raw,
                TextType.Tip,
                TextType.System,
                TextType.JsonWhisper,
                TextType.Json,
                TextType.JsonAnnouncement
            ];

            for (const type of types) {
                const buffer = encode({ ...raw, type, message: 'm' });

                expect([...buffer]).toEqual([HEADER, 0x00, 0x00, type, ...str('m'), 0x00, 0x00, 0x00]);
            }
            expect(TextType.JsonAnnouncement).toBe(11);
        });

        it('writes a Popup and a JukeboxPopup with a Parameter List, like Translation', () => {
            for (const type of [TextType.Popup, TextType.JukeboxPopup]) {
                const buffer = encode({ ...raw, type, message: 'm', parameters: ['p'] });

                expect([...buffer]).toEqual([
                    HEADER,
                    0x00,
                    0x02,
                    type,
                    ...str('m'),
                    0x01,
                    ...str('p'),
                    0x00,
                    0x00,
                    0x00
                ]);
            }
        });

        it('writes a Whisper and an Announcement with a Player Name, like Chat', () => {
            for (const type of [TextType.Whisper, TextType.Announcement]) {
                const buffer = encode({ ...chat, type, sourceName: 'S', message: 'm' });

                expect([...buffer.subarray(0, 8)]).toEqual([HEADER, 0x00, 0x01, type, ...str('S'), ...str('m')]);
            }
        });
    });

    describe('deserialize', () => {
        it('reads a Chat message with a present Filtered Message and consumes the whole buffer', () => {
            const stream = new NetworkBinaryStream(
                Buffer.from([
                    HEADER,
                    0x00,
                    0x01,
                    0x01,
                    ...str('Steve'),
                    ...str('hi'),
                    ...str('2535'),
                    ...str('p1'),
                    0x01,
                    ...str('hi!')
                ])
            );
            const data = new TextPacket().deserialize(stream);

            expect(data).toEqual({ ...chat, filtered: 'hi!' });
            expect(stream.feof()).toBe(true);
        });

        it('reads a Translation with two parameters and an absent Filtered Message', () => {
            const stream = new NetworkBinaryStream(
                Buffer.from([
                    HEADER,
                    0x01,
                    0x02,
                    0x02,
                    ...str('%a'),
                    0x02,
                    ...str('x'),
                    ...str('yz'),
                    ...str('X'),
                    ...str('P'),
                    0x00
                ])
            );
            const data = new TextPacket().deserialize(stream);

            expect(data).toEqual({ ...translation, xuid: 'X', platformChatId: 'P' });
            expect(stream.feof()).toBe(true);
        });

        it('reads a Raw message with nothing optional and no sourceName or parameters keys', () => {
            const stream = new NetworkBinaryStream(
                Buffer.from([HEADER, 0x00, 0x00, 0x00, ...str('hi'), 0x00, 0x00, 0x00])
            );
            const data = new TextPacket().deserialize(stream);

            expect(data).toEqual(raw);
            expect('sourceName' in data).toBe(false);
            expect('parameters' in data).toBe(false);
            expect(stream.feof()).toBe(true);
        });

        it('reads a Chat the way a client sends one: its own name as the author, nothing filtered', () => {
            const stream = new NetworkBinaryStream(
                Buffer.from([
                    HEADER,
                    0x00, // Localize?: false
                    0x01, // Body: AuthorAndMessage
                    0x01, // Message Type: chat
                    ...str('runner'), // Player Name
                    ...str('hello'), // Message
                    ...str('2535428504464321'), // Sender's XUID
                    ...str(''), // Platform Id
                    0x00 // Filtered Message: absent
                ])
            );
            const data = new TextPacket().deserialize(stream);

            expect(data).toEqual({
                type: TextType.Chat,
                needsTranslation: false,
                sourceName: 'runner',
                message: 'hello',
                xuid: '2535428504464321',
                platformChatId: '',
                filtered: ''
            });
            expect(stream.feof()).toBe(true);
        });

        it('rejects a body variant it does not know', () => {
            const stream = new NetworkBinaryStream(
                Buffer.from([HEADER, 0x00, 0x03, 0x00, ...str('m'), 0x00, 0x00, 0x00])
            );

            expect(() => new TextPacket().deserialize(stream)).toThrow('Unknown TextPacket body variant 3');
        });
    });

    it('round trips each body variant', () => {
        for (const data of [raw, chat, translation]) {
            expect(new TextPacket().deserialize(new NetworkBinaryStream(encode(data)))).toEqual(data);
        }
    });
});
