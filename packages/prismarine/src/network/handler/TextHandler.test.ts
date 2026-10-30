import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import type { Chat } from '../../chat/Chat';
import { ChatType } from '../../chat/Chat';
import type { ChatManager } from '../../chat/ChatManager';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import TextPacket from '@jsprismarine/protocol/packet/TextPacket';
import { TextPacketType } from '@jsprismarine/protocol';
import TextHandler from './TextHandler';

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

describe('network', () => {
    describe('handler', () => {
        describe('TextHandler', () => {
            it('relays a chat under the sender, with the message as typed', async () => {
                const { sent, player, server, session } = fakeChat();

                await new TextHandler().handle(chatPacket('hello world'), server, session);

                expect(sent).toHaveLength(1);
                expect(sent[0]?.getMessage()).toBe('hello world');
                expect(sent[0]?.getType()).toBe(ChatType.CHAT);
                expect(sent[0]?.getSender()).toBe(player);
            });

            it('takes the sender from the session, not from the name the packet carries', async () => {
                const pk = new TextPacket({
                    type: TextPacketType.Chat,
                    needsTranslation: false,
                    sourceName: 'admin',
                    message: 'hello',
                    xuid: '1',
                    platformChatId: '',
                    filtered: ''
                });

                const { sent, player, server, session } = fakeChat();
                await new TextHandler().handle(pk, server, session);

                expect(sent[0]?.getSender()).toBe(player);
            });

            it('drops every type but Chat, which is the only one a client sends', async () => {
                const { sent, dropped, server, session } = fakeChat();

                for (const type of [
                    TextPacketType.Raw,
                    TextPacketType.SystemMessage,
                    TextPacketType.Translate,
                    TextPacketType.Announcement,
                    200
                ]) {
                    await new TextHandler().handle(chatPacket('server is down', type), server, session);
                }

                expect(sent).toEqual([]);
                expect(dropped).toHaveLength(5);
                expect(dropped[0]).toContain('Raw');
                expect(dropped[4]).toContain('200');
            });

            it('strips formatting codes and line breaks, which would forge a second speaker', async () => {
                const { sent, server, session } = fakeChat();

                await new TextHandler().handle(chatPacket('hi\n§cadmin§r: server is down'), server, session);

                expect(sent.map((chat) => chat.getMessage())).toEqual(['hiadmin: server is down']);
            });

            it('cuts a message longer than a chat box can hold', async () => {
                const { sent, server, session } = fakeChat();

                await new TextHandler().handle(chatPacket('a'.repeat(5000)), server, session);

                expect(sent[0]?.getMessage()).toBe('a'.repeat(512));
            });

            it('says nothing for a message that is only whitespace', async () => {
                const { sent, server, session } = fakeChat();

                await new TextHandler().handle(chatPacket('   \n  '), server, session);

                expect(sent).toEqual([]);
            });
        });
    });
});

/** A chat manager that records what it was asked to send, a logger that records drops, and a player named "runner". */
const fakeChat = () => {
    const sent: Chat[] = [];
    const dropped: string[] = [];
    const player = stub<Player>({ getName: () => 'runner' });

    return {
        sent,
        dropped,
        player,
        server: stub<Server>({
            getChatManager: () => stub<ChatManager>({ send: async (chat) => void sent.push(chat) }),
            getLogger: () => stub<Logger>({ verbose: (message: string) => void dropped.push(message) })
        }),
        session: stub<PlayerSession>({ getPlayer: () => player })
    };
};
