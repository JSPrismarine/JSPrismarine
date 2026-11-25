import { TextPacketType } from '@jsprismarine/protocol';
import TextPacket from '@jsprismarine/protocol/bedrock/packet/TextPacket';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../../testing/decodeView.test-utils';
import TextDecoder from './TextDecoder';

/** A Chat text as a client sends it: its own name as the author, nothing filtered. */
const chatPacket = (message: string, type: TextPacketType = TextPacketType.Chat): TextPacket =>
    new TextPacket({
        type,
        needsTranslation: false,
        sourceName: 'runner',
        message,
        xuid: '2535',
        platformChatId: '',
        filtered: ''
    });

describe('TextDecoder', () => {
    it('decodes a chat line as typed', () => {
        const { view, logged } = decodeView({ name: 'runner' });

        expect(new TextDecoder().decode(chatPacket('hello world'), view)).toStrictEqual([
            { kind: 'chat', message: 'hello world' }
        ]);
        expect(logged).toEqual([]);
    });

    it('drops every type but Chat, which is the only one a client sends', () => {
        const { view, logged } = decodeView({ name: 'runner' });
        const decoder = new TextDecoder();

        for (const type of [
            TextPacketType.Raw,
            TextPacketType.SystemMessage,
            TextPacketType.Translate,
            TextPacketType.Announcement,
            200
        ]) {
            expect(decoder.decode(chatPacket('server is down', type), view)).toEqual([]);
        }

        expect(logged).toHaveLength(5);
        expect(logged[0]).toContain('Raw');
        expect(logged[4]).toContain('200');
    });

    it('strips formatting codes and line breaks, which would forge a second speaker', () => {
        const { view } = decodeView({ name: 'runner' });

        expect(new TextDecoder().decode(chatPacket('hi\n§cadmin§r: server is down'), view)).toStrictEqual([
            { kind: 'chat', message: 'hiadmin: server is down' }
        ]);
    });

    it('cuts a message longer than a chat box can hold', () => {
        const { view } = decodeView({ name: 'runner' });

        expect(new TextDecoder().decode(chatPacket('a'.repeat(5000)), view)[0]?.message).toBe('a'.repeat(512));
    });

    it('decodes nothing for a message that is only whitespace', () => {
        const { view, logged } = decodeView({ name: 'runner' });

        expect(new TextDecoder().decode(chatPacket('   \n  '), view)).toEqual([]);
        expect(logged).toEqual([]);
    });
});
