import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, textPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import TextPacketType from '../type/TextPacketType';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout, one per body variant plus the empty filtered message.
 *
 * Which fields travel is decided by the message type, so the body is one wire type whose
 * reader and writer switch; the version gates are not involved.
 */
const MESSAGE_ONLY = Buffer.from('010006036d7367027831027063010466696c74', 'hex');
const AUTHOR_AND_MESSAGE = Buffer.from('010101055374657665036d7367027831027063010466696c74', 'hex');
const MESSAGE_AND_PARAMS = Buffer.from('010202036d7367020161026262027831027063010466696c74', 'hex');
const UNFILTERED = Buffer.from('010000036d736702783102706300', 'hex');

describe('the declarative Text layout', () => {
    const layout = layoutAt(textPacket, 2193);

    const payload = (
        type: TextPacketType,
        body: { sourceName?: string; parameters?: string[] },
        filtered = 'filt'
    ) => ({
        needsTranslation: true,
        body: { type, sourceName: body.sourceName ?? '', message: 'msg', parameters: body.parameters ?? [] },
        xuid: 'x1',
        platformChatId: 'pc',
        filtered
    });

    const cases = [
        ['MessageOnly', MESSAGE_ONLY, payload(TextPacketType.SystemMessage, {})],
        ['AuthorAndMessage', AUTHOR_AND_MESSAGE, payload(TextPacketType.Chat, { sourceName: 'Steve' })],
        ['MessageAndParams', MESSAGE_AND_PARAMS, payload(TextPacketType.Translate, { parameters: ['a', 'bb'] })],
        ['an absent filtered message', UNFILTERED, payload(TextPacketType.Raw, {}, null)]
    ] as const;

    for (const [name, bytes, value] of cases) {
        it(`writes the bytes the hand-written encoder wrote for ${name}`, () => {
            const stream = new BinaryStream();
            layout.encode(stream, value);

            expect(stream.getBuffer()).toEqual(bytes);
        });

        it(`reads ${name} back`, () => {
            expect(layout.decode(new BinaryStream(bytes))).toEqual(value);
        });
    }
});
