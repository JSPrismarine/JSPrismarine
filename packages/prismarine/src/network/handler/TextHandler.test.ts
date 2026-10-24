import { describe, expect, it } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import type { Chat } from '../../chat/Chat';
import type { ChatManager } from '../../chat/ChatManager';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import TextPacket from '../packet/TextPacket';
import TextHandler from './TextHandler';

describe('network', () => {
    describe('handler', () => {
        describe('TextHandler', () => {
            it('handle', async () => {
                const pk = new TextPacket();
                pk.message = 'hello world';

                const sent: Chat[] = [];
                const server = stub<Server>({
                    getChatManager: () => stub<ChatManager>({ send: async (chat) => void sent.push(chat) })
                });
                const session = stub<PlayerSession>({
                    getPlayer: () => stub<Player>({ getFormattedUsername: () => 'runner' })
                });

                await new TextHandler().handle(pk, server, session);

                expect(sent.map((chat) => chat.getMessage())).toEqual(['runner hello world']);
            });

            it('strips formatting codes and line breaks, which would forge a second speaker', async () => {
                const pk = new TextPacket();
                pk.message = 'hi\n§cadmin§r: server is down';

                const { sent, server, session } = fakeChat();
                await new TextHandler().handle(pk, server, session);

                expect(sent.map((chat) => chat.getMessage())).toEqual(['runner hiadmin: server is down']);
            });

            it('cuts a message longer than a chat box can hold', async () => {
                const pk = new TextPacket();
                pk.message = 'a'.repeat(5000);

                const { sent, server, session } = fakeChat();
                await new TextHandler().handle(pk, server, session);

                expect(sent[0]?.getMessage()).toBe(`runner ${'a'.repeat(512)}`);
            });

            it('says nothing for a message that is only whitespace', async () => {
                const pk = new TextPacket();
                pk.message = '   \n  ';

                const { sent, server, session } = fakeChat();
                await new TextHandler().handle(pk, server, session);

                expect(sent).toEqual([]);
            });
        });
    });
});

/** A chat manager that records what it was asked to send, and a player named "runner". */
const fakeChat = () => {
    const sent: Chat[] = [];

    return {
        sent,
        server: stub<Server>({
            getChatManager: () => stub<ChatManager>({ send: async (chat) => void sent.push(chat) })
        }),
        session: stub<PlayerSession>({
            getPlayer: () => stub<Player>({ getFormattedUsername: () => 'runner' })
        })
    };
};
