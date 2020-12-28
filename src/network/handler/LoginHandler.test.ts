import Identifiers from '../Identifiers';
import LoginHandler from './LoginHandler';
import LoginPacket from '../packet/LoginPacket';

describe('network', () => {
    describe('handler', () => {
        describe('LoginHandler', () => {
            it('handle with non-banned', async (done) => {
                const pk = new LoginPacket();
                pk.displayName = 'runner';
                pk.protocol = Identifiers.Protocol;

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
                    }),
                    kick: (message) => {
                        expect(message).toBe('You have been banned!');
                        done();
                    }
                };

                const handler = new LoginHandler();
                await handler.handle(
                    pk,
                    {
                        getBanManager: () => ({
                            isBanned: (player) => {
                                return false;
                            }
                        }),
                        getPlayerByExactName(name: string) {
                            return null;
                        }
                    } as any,
                    player as any
                );
            });

            it('handle with banned without reason', async (done) => {
                const pk = new LoginPacket();
                pk.displayName = 'runner';
                pk.protocol = Identifiers.Protocol;

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

                const handler = new LoginHandler();
                await handler.handle(
                    pk,
                    {
                        getBanManager: () => ({
                            isBanned: (player) => {
                                return '';
                            }
                        }),
                        getPlayerByExactName(name: string) {
                            return null;
                        }
                    } as any,
                    player as any
                );
            });

            it('handle with banned with reason', async (done) => {
                const pk = new LoginPacket();
                pk.displayName = 'runner';
                pk.protocol = Identifiers.Protocol;

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

                const handler = new LoginHandler();
                await handler.handle(
                    pk,
                    {
                        getBanManager: () => ({
                            isBanned: (player) => {
                                return 'a reason';
                            }
                        }),
                        getPlayerByExactName(name: string) {
                            return null;
                        }
                    } as any,
                    player as any
                );
            });

            it('handle invalid username', async (done) => {
                const pk = new LoginPacket();
                pk.displayName = '';
                pk.protocol = Identifiers.Protocol;

                const player = {
                    username: {},
                    getConnection: () => ({
                        sendPlayStatus: (status) => {
                            expect(status).toBe(0);
                        }
                    }),
                    kick: (message) => {
                        expect(message).toBe('Invalid username!');
                        done();
                    }
                };

                const handler = new LoginHandler();
                await handler.handle(pk, {} as any, player as any);
            });

            it('handle outdated client', async (done) => {
                const pk = new LoginPacket();
                pk.displayName = '';
                pk.protocol = Identifiers.Protocol - 10;

                const player = {
                    username: {},
                    getConnection: () => ({
                        sendPlayStatus: (status) => {
                            expect(status).toBe(1);
                            done();
                        }
                    })
                };

                const handler = new LoginHandler();
                await handler.handle(pk, {} as any, player as any);
            });

            it('handle outdated server', async (done) => {
                const pk = new LoginPacket();
                pk.displayName = '';
                pk.protocol = Identifiers.Protocol + 10;

                const player = {
                    username: {},
                    getConnection: () => ({
                        sendPlayStatus: (status) => {
                            expect(status).toBe(2);
                            done();
                        }
                    })
                };

                const handler = new LoginHandler();
                await handler.handle(pk, {} as any, player as any);
            });
        });
    });
});
