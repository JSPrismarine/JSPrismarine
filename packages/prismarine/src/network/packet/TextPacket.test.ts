import { NetworkBinaryStream, TextPacket as ProtocolTextPacket } from '@jsprismarine/protocol';
import { netIdFor } from '@jsprismarine/protocol/wire/versions/v2193';
import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import TextPacketType from '../type/TextPacketType';
import TextPacket from './TextPacket';

/** The header: packet id 9 as a varuint, no subclient ids. */
const HEADER = 0x09;

/** A string as the wire carries it: a varuint length, then the UTF-8 bytes. One length byte for these. */
const str = (text: string): number[] => [Buffer.byteLength(text), ...Buffer.from(text, 'utf-8')];

interface Fields {
    type: TextPacketType;
    needsTranslation?: boolean;
    sourceName?: string;
    message: string;
    parameters?: string[];
    xuid?: string;
    platformChatId?: string;
    filtered?: string;
}

const packet = ({
    type,
    needsTranslation = false,
    sourceName = '',
    message,
    parameters = [],
    xuid = '',
    platformChatId = '',
    filtered = ''
}: Fields): TextPacket => {
    const pk = new TextPacket();
    pk.type = type;
    pk.needsTranslation = needsTranslation;
    pk.sourceName = sourceName;
    pk.message = message;
    pk.parameters = parameters;
    pk.xuid = xuid;
    pk.platformChatId = platformChatId;
    pk.filtered = filtered;
    return pk;
};

const encode = (fields: Fields): Buffer => {
    const pk = packet(fields);
    pk.encode();
    return pk.getBuffer();
};

const decode = (bytes: number[]): TextPacket => {
    const pk = new TextPacket();
    pk.setReadBuffer(Buffer.from(bytes));
    pk.decode();
    return pk;
};

const announcement = '{"rawtext":[{"text":"Server restarts in 5 minutes"}]}';

/** A textObjectAnnouncement as the wire carries it, one entry per docs field. */
const announcementWire = [
    HEADER,
    0x00, // Localize?: false
    0x00, // Body: MessageOnly
    0x0b, // Message Type: textObjectAnnouncement
    ...str(announcement), // Message
    ...str('2535428504464321'), // Sender's XUID
    ...str(''), // Platform Id
    0x00 // Filtered Message: absent
];

describe('network', () => {
    describe('packet', () => {
        describe('TextPacket', () => {
            it('uses the network id the client expects', () => {
                expect(netIdFor('TextPacket')).toBe(Identifiers.TextPacket);
                expect(netIdFor('TextPacket')).toBe(9);
            });

            describe('encode', () => {
                it('writes a Raw message as body variant 0, type after the variant index', () => {
                    const buffer = encode({ type: TextPacketType.Raw, message: 'hi' });

                    expect([...buffer]).toEqual([
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
                    const buffer = encode({
                        type: TextPacketType.Chat,
                        sourceName: 'Steve',
                        message: 'hi',
                        xuid: '2535',
                        platformChatId: 'p1',
                        filtered: 'hi'
                    });

                    expect([...buffer]).toEqual([
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
                    const buffer = encode({
                        type: TextPacketType.Translate,
                        needsTranslation: true,
                        message: '%a',
                        parameters: ['x', 'yz']
                    });

                    expect([...buffer]).toEqual([
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
                    const absent = encode({ type: TextPacketType.SystemMessage, message: 'm' });
                    const present = encode({ type: TextPacketType.SystemMessage, message: 'm', filtered: 'f' });

                    expect([...absent.subarray(-1)]).toEqual([0x00]);
                    expect([...present.subarray(-3)]).toEqual([0x01, ...str('f')]);
                    expect(present.length).toBe(absent.length + 2);
                });

                it('writes a Popup and a JukeboxPopup with a Parameter List, like Translation', () => {
                    for (const type of [TextPacketType.Popup, TextPacketType.JukeboxPopup]) {
                        const buffer = encode({ type, message: 'm', parameters: ['p'] });

                        expect([...buffer]).toEqual([
                            HEADER,
                            0x00, // Localize?
                            0x02, // Body variant: MessageAndParams
                            type,
                            ...str('m'), // Message
                            0x01, // Parameter List count
                            ...str('p'),
                            ...str(''), // Sender's XUID
                            ...str(''), // Platform Id
                            0x00 // Filtered Message: absent
                        ]);
                    }
                });

                it('writes a Whisper and an Announcement with a Player Name, like Chat', () => {
                    for (const type of [TextPacketType.Whisper, TextPacketType.Announcement]) {
                        const buffer = encode({ type, sourceName: 'S', message: 'm' });

                        expect([...buffer.subarray(0, 8)]).toEqual([
                            HEADER,
                            0x00,
                            0x01,
                            type,
                            ...str('S'),
                            ...str('m')
                        ]);
                    }
                });

                it('writes a textObjectAnnouncement as a MessageOnly body in docs order', () => {
                    const buffer = encode({
                        type: TextPacketType.TextObjectAnnouncement,
                        message: announcement,
                        xuid: '2535428504464321'
                    });

                    expect([...buffer]).toEqual(announcementWire);
                });
            });

            describe('decode', () => {
                it('reads a Chat message with a present Filtered Message and consumes the whole buffer', () => {
                    const pk = decode([
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
                    ]);

                    expect(pk.needsTranslation).toBe(false);
                    expect(pk.type).toBe(TextPacketType.Chat);
                    expect(pk.sourceName).toBe('Steve');
                    expect(pk.message).toBe('hi');
                    expect(pk.parameters).toEqual([]);
                    expect(pk.xuid).toBe('2535');
                    expect(pk.platformChatId).toBe('p1');
                    expect(pk.filtered).toBe('hi!');
                    expect(pk.feof()).toBe(true);
                });

                it('reads a Translation with two parameters and an absent Filtered Message', () => {
                    const pk = decode([
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
                    ]);

                    expect(pk.needsTranslation).toBe(true);
                    expect(pk.type).toBe(TextPacketType.Translate);
                    expect(pk.message).toBe('%a');
                    expect(pk.parameters).toEqual(['x', 'yz']);
                    expect(pk.xuid).toBe('X');
                    expect(pk.platformChatId).toBe('P');
                    expect(pk.filtered).toBe('');
                    expect(pk.feof()).toBe(true);
                });

                it('reads a Raw message with nothing optional', () => {
                    const pk = decode([HEADER, 0x00, 0x00, 0x00, ...str('hello'), 0x00, 0x00, 0x00]);

                    expect(pk.type).toBe(TextPacketType.Raw);
                    expect(pk.message).toBe('hello');
                    expect(pk.feof()).toBe(true);
                });

                it('reads a Chat the way a client sends one: its own name as the author, nothing filtered', () => {
                    const pk = decode([
                        HEADER,
                        0x00, // Localize?: false
                        0x01, // Body: AuthorAndMessage
                        0x01, // Message Type: chat
                        ...str('runner'), // Player Name
                        ...str('hello'), // Message
                        ...str('2535428504464321'), // Sender's XUID
                        ...str(''), // Platform Id
                        0x00 // Filtered Message: absent
                    ]);

                    expect(pk.type).toBe(TextPacketType.Chat);
                    expect(pk.sourceName).toBe('runner');
                    expect(pk.message).toBe('hello');
                    expect(pk.xuid).toBe('2535428504464321');
                    expect(pk.filtered).toBe('');
                    expect(pk.feof()).toBe(true);
                });

                it('reads a hand-built textObjectAnnouncement and consumes it all', () => {
                    const pk = decode(announcementWire);

                    expect(pk.type).toBe(TextPacketType.TextObjectAnnouncement);
                    expect(pk.needsTranslation).toBe(false);
                    expect(pk.message).toBe(announcement);
                    expect(pk.parameters).toEqual([]);
                    expect(pk.xuid).toBe('2535428504464321');
                    expect(pk.platformChatId).toBe('');
                    expect(pk.filtered).toBe('');
                    expect(pk.feof()).toBe(true);
                });

                it('rejects a body variant it does not know', () => {
                    expect(() => decode([HEADER, 0x00, 0x03, 0x00, ...str('m'), 0x00, 0x00, 0x00])).toThrow(
                        'Unknown TextPacket body variant 3'
                    );
                });
            });

            it('produces the same bytes as the protocol package for every body variant', () => {
                const cases: Fields[] = [
                    { type: TextPacketType.Raw, message: 'hi', filtered: 'hi' },
                    {
                        type: TextPacketType.Chat,
                        sourceName: 'Steve',
                        message: 'hi',
                        xuid: '2535',
                        platformChatId: 'p1'
                    },
                    { type: TextPacketType.Translate, needsTranslation: true, message: '%a', parameters: ['x', 'yz'] },
                    { type: TextPacketType.TextObjectAnnouncement, message: announcement }
                ];

                for (const fields of cases) {
                    const shared = new ProtocolTextPacket({
                        type: fields.type,
                        needsTranslation: fields.needsTranslation ?? false,
                        ...(fields.sourceName === undefined ? {} : { sourceName: fields.sourceName }),
                        message: fields.message,
                        ...(fields.parameters === undefined ? {} : { parameters: fields.parameters }),
                        xuid: fields.xuid ?? '',
                        platformChatId: fields.platformChatId ?? '',
                        filtered: fields.filtered ?? ''
                    }).serialize(new NetworkBinaryStream());

                    expect([...encode(fields)]).toEqual([...shared]);
                }
            });
        });
    });
});
