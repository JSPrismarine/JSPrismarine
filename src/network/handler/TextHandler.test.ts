import TextPacket from '../packet/TextPacket';
import TextHandler from './TextHandler';

describe('network', () => {
    describe('handler', () => {
        describe('TextHandler', () => {
            it('handle', (done) => {
                const pk = new TextPacket();
                pk.message = 'hello world';

                TextHandler.handle(
                    pk,
                    {
                        getChatManager: () => ({
                            send: (chat) => {
                                expect(chat.getMessage()).toBe(
                                    'runner hello world'
                                );
                                done();
                            }
                        })
                    } as any,
                    {
                        getFormattedUsername: () => {
                            return 'runner';
                        }
                    } as any
                );
            });
        });
    });
});
