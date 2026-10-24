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
        });
    });
});
