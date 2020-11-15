import LoginPacket from '../packet/LoginPacket';
import LoginHandler from './LoginHandler';

describe('network', () => {
    describe('handler', () => {
        describe('LoginHandler', () => {
            it('handle with non-banned', (done) => {
                const pk = new LoginPacket();
                pk.displayName = 'runner';

                const player = {
                    username: {},
                    getConnection: () => ({
                        sendPlayStatus: (status) => {
                            expect(status).toBe(0);
                        },
                        sendDataPacket: (packet) => {
                            expect(player.username).toStrictEqual({
                                name: 'runner'
                            });
                            done();
                        }
                    })
                };

                LoginHandler.handle(
                    pk,
                    {
                        getBanManager: () => ({
                            isBanned: (player) => {
                                return false;
                            }
                        })
                    } as any,
                    player as any
                );
            });

            it('handle with banned without reason', (done) => {
                const pk = new LoginPacket();
                pk.displayName = 'runner';

                const player = {
                    username: {},
                    getConnection: () => ({
                        sendPlayStatus: (status) => {
                            expect(status).toBe(0);
                        }
                    }),
                    kick: (message) => {
                        expect(message).toBe('You have been banned!');
                        done();
                    }
                };

                LoginHandler.handle(
                    pk,
                    {
                        getBanManager: () => ({
                            isBanned: (player) => {
                                return '';
                            }
                        })
                    } as any,
                    player as any
                );
            });

            it('handle with banned with reason', (done) => {
                const pk = new LoginPacket();
                pk.displayName = 'runner';

                const player = {
                    username: {},
                    getConnection: () => ({
                        sendPlayStatus: (status) => {
                            expect(status).toBe(0);
                        }
                    }),
                    kick: (message) => {
                        expect(message).toBe(
                            'You have been banned for reason: a reason!'
                        );
                        done();
                    }
                };

                LoginHandler.handle(
                    pk,
                    {
                        getBanManager: () => ({
                            isBanned: (player) => {
                                return 'a reason';
                            }
                        })
                    } as any,
                    player as any
                );
            });
        });
    });
});
