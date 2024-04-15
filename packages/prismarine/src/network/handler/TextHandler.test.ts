import { describe, expect, it } from 'vitest';

import TextPacket from '../packet/TextPacket';
import TextHandler from './TextHandler';

describe('network', () => {
    describe('handler', () => {
        describe('TextHandler', () => {
            it('handle', async () => {
                const pk = new TextPacket();
                pk.message = 'hello world';

                const handler = new TextHandler();
                await handler.handle(
                    pk,
                    {
                        getChatManager: () => ({
                            send: (chat: any) => {
                                expect(chat.getMessage()).toBe('runner hello world');
                            }
                        })
                    } as any,
                    {
                        getPlayer: () => ({
                            getFormattedUsername: () => {
                                return 'runner';
                            }
                        })
                    } as any
                );
            });
        });
    });
});
