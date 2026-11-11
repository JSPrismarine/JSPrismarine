import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import type { Chat } from '../../chat/Chat';
import { ChatType } from '../../chat/Chat';
import { inputContext } from '../../testing/handlerContext.test.helper';
import type { HandlerServices } from './HandlerContext';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
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
                const { sent, handle, session } = fakeChat();

                await handle(chatPacket('hello world'));

                expect(sent).toHaveLength(1);
                expect(sent[0]?.getMessage()).toBe('hello world');
                expect(sent[0]?.getType()).toBe(ChatType.CHAT);
                expect(sent[0]?.getSender()).toBe(session);
            });

            it('defers the chat line to after the handler returns', async () => {
                const { handle } = fakeChat();

                expect(await handle(chatPacket('hello'))).toEqual({
                    returned: undefined,
                    outputs: 0,
                    deferred: 1,
                    sent: 0
                });
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

                const { sent, handle, session } = fakeChat();
                await handle(pk);

                expect(sent[0]?.getSender()).toBe(session);
            });

            it('drops every type but Chat, which is the only one a client sends', async () => {
                const { sent, dropped, handle } = fakeChat();

                for (const type of [
                    TextPacketType.Raw,
                    TextPacketType.SystemMessage,
                    TextPacketType.Translate,
                    TextPacketType.Announcement,
                    200
                ]) {
                    await handle(chatPacket('server is down', type));
                }

                expect(sent).toEqual([]);
                expect(dropped).toHaveLength(5);
                expect(dropped[0]).toContain('Raw');
                expect(dropped[4]).toContain('200');
            });

            it('strips formatting codes and line breaks, which would forge a second speaker', async () => {
                const { sent, handle } = fakeChat();

                await handle(chatPacket('hi\n§cadmin§r: server is down'));

                expect(sent.map((chat) => chat.getMessage())).toEqual(['hiadmin: server is down']);
            });

            it('cuts a message longer than a chat box can hold', async () => {
                const { sent, handle } = fakeChat();

                await handle(chatPacket('a'.repeat(5000)));

                expect(sent[0]?.getMessage()).toBe('a'.repeat(512));
            });

            it('says nothing for a message that is only whitespace', async () => {
                const { sent, handle } = fakeChat();

                await handle(chatPacket('   \n  '));

                expect(sent).toEqual([]);
            });
        });
    });
});

/** A chat manager that records what it was asked to send, a logger that records drops, and a player named "runner". */
const fakeChat = () => {
    const sent: Chat[] = [];
    const dropped: string[] = [];
    const player = stubPlayerPort({ getName: () => 'runner' });
    const session = stub<PlayerSession>({ identity: identityNamed('runner'), getPlayer: () => player });

    return {
        sent,
        dropped,
        player,
        session,
        /** Runs one packet as the input step would, and returns what the handler handed the step. */
        handle: async (packet: TextPacket) => {
            const { context, outputs, deferred, settled } = inputContext(session, {
                log: stub<Logger>({ verbose: (message: string) => void dropped.push(message) }),
                services: {
                    chat: stub<HandlerServices['chat']>({ send: async (chat) => void sent.push(chat) })
                }
            });
            const returned = new TextHandler().handle(packet, context);
            const handed = { returned, outputs: outputs.length, deferred: deferred.length, sent: sent.length };
            await settled();
            return handed;
        }
    };
};
