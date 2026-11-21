import { describe, expect, it } from 'vitest';

import type { Chat } from '../../chat/Chat';
import { ChatType } from '../../chat/Chat';
import type { HandlerServices } from '../../network/handler/HandlerContext';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../../network/PlayerSession';
import ChatHandler from './ChatHandler';

describe('ChatHandler', () => {
    it('sends the line under the sender in the handler and hands the step its delivery', async () => {
        const sent: Chat[] = [];
        const session = stub<PlayerSession>({ identity: identityNamed('runner') });
        const { context, outputs, settled } = inputContext(session, {
            services: { chat: stub<HandlerServices['chat']>({ send: async (chat) => void sent.push(chat) }) }
        });

        expect(new ChatHandler().handle({ kind: 'chat', message: 'hello world' }, context)).toBeUndefined();

        // Sent in the handler's unit; the delivery is the step's to finish.
        expect(sent).toHaveLength(1);
        expect(outputs).toHaveLength(1);
        await settled();
        expect(sent[0]?.getMessage()).toBe('hello world');
        expect(sent[0]?.getType()).toBe(ChatType.CHAT);
        expect(sent[0]?.getSender()).toBe(session);
    });
});
