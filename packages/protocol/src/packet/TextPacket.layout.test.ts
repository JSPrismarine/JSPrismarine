import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt } from '../wire/WireLayout';
import { textPacket } from '../wire/definitions/chat';
import { describe, expect, it } from 'vitest';

import { TextPacketType } from './TextPacket';
import { enumDumpMembers } from '../testing/evidence.test.helper';

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

describe('TextPacketType', () => {
    // The 1.26.50 docs page numbers each body variant's members from zero and the 1.26.60 page
    // lists eleven "enum value changed" rows. Mojang's dump numbers the enum globally, and the
    // wire carries the global value at both protocols (docs/research/protocol-2225-delta.md).
    it("numbers the message types the way Mojang's enum dump does", () => {
        const members = Object.entries(TextPacketType)
            .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
            .map(([name, value]): [string, number] => [name.toLowerCase(), value]);

        expect(members).toEqual(
            enumDumpMembers('TextPacketType').map(({ name, value }): [string, number] => [name.toLowerCase(), value])
        );
    });
});

describe.each([2193, 2225] as const)('the declarative Text layout at %i', (protocol) => {
    const layout = layoutAt(textPacket, protocol);

    const payload = (
        type: TextPacketType,
        body: { sourceName?: string; parameters?: string[] },
        filtered: string | null = 'filt'
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
