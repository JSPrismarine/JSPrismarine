import Identifiers from '../Identifiers';
import LoginHandler from './LoginHandler';
import LoginPacket from '../packet/LoginPacket';

describe('network', () => {
    describe('handler', () => {
        describe('LoginHandler', () => {
            it('handle with non-banned', (done) => {
                (async () => {
                    const pk = new LoginPacket();
                    pk.displayName = 'runner';
                    pk.protocol = Identifiers.Protocol;

                    const player = {
                        username: {},
                        onEnable: () => {},
                        getConnection: () => ({
                            sendPlayStatus: (status: any) => {
                                expect(status).toBe(0);
                            },
                            sendDataPacket: (packet: any) => {
                                expect(player.username).toStrictEqual({
                                    name: 'runner'
                                });
                                done();
                            }
                        }),
                        kick: (message: any) => {
                            expect(message).toBe('You have been banned!');
                            done();
                        }
                    } as any;

                    const handler = new LoginHandler();
                    await handler.handle(
                        pk,
                        {
                            getBanManager: () => ({
                                isBanned: (player: any) => {
                                    return false;
                                }
                            }),
                            getPlayerByExactName(name: string) {
                                return null;
                            }
                        } as any,
                        player
                    );
                })();
            });

            it('handle with banned without reason', (done) => {
                (async () => {
                    const pk = new LoginPacket();
                    pk.displayName = 'runner';
                    pk.protocol = Identifiers.Protocol;

                    const player = {
                        username: {},
                        onEnable: () => {},
                        getConnection: () => ({
                            sendPlayStatus: (status: any) => {
                                expect(status).toBe(0);
                            }
                        }),
                        kick: (message: any) => {
                            expect(message).toBe('You have been banned!');
                            done();
                        }
                    } as any;

                    const handler = new LoginHandler();
                    await handler.handle(
                        pk,
                        {
                            getBanManager: () => ({
                                isBanned: (player: any) => {
                                    return '';
                                }
                            }),
                            getPlayerByExactName(name: string) {
                                return null;
                            }
                        } as any,
                        player
                    );
                })();
            });

            it('handle with banned with reason', (done) => {
                (async () => {
                    const pk = new LoginPacket();
                    pk.displayName = 'runner';
                    pk.protocol = Identifiers.Protocol;

                    const player = {
                        username: {},
                        onEnable: () => {},
                        getConnection: () => ({
                            sendPlayStatus: (status: any) => {
                                expect(status).toBe(0);
                            }
                        }),
                        kick: (message: any) => {
                            expect(message).toBe('You have been banned for reason: a reason!');
                            done();
                        }
                    } as any;

                    const handler = new LoginHandler();
                    await handler.handle(
                        pk,
                        {
                            getBanManager: () => ({
                                isBanned: (player: any) => {
                                    return 'a reason';
                                }
                            }),
                            getPlayerByExactName(name: string) {
                                return null;
                            }
                        } as any,
                        player
                    );
                })();
            });

            it('handle invalid username', (done) => {
                (async () => {
                    const pk = new LoginPacket();
                    pk.displayName = '';
                    pk.protocol = Identifiers.Protocol;

                    const player = {
                        username: {},
                        onEnable: () => {},
                        getConnection: () => ({
                            sendPlayStatus: (status: any) => {
                                expect(status).toBe(0);
                            }
                        }),
                        kick: (message: any) => {
                            expect(message).toBe('Invalid username!');
                            done();
                        }
                    } as any;

                    const handler = new LoginHandler();
                    await handler.handle(pk, {} as any, player);
                })();
            });

            it('handle outdated client', (done) => {
                (async () => {
                    const pk = new LoginPacket();
                    pk.displayName = '';
                    pk.protocol = Identifiers.Protocol - 10;

                    const player = {
                        username: {},
                        onEnable: () => {},
                        getConnection: () => ({
                            sendPlayStatus: (status: any) => {
                                expect(status).toBe(1);
                                done();
                            }
                        })
                    } as any;

                    const handler = new LoginHandler();
                    await handler.handle(pk, {} as any, player);
                })();
            });

            it('handle outdated server', (done) => {
                (async () => {
                    const pk = new LoginPacket();
                    pk.displayName = '';
                    pk.protocol = Identifiers.Protocol + 10;

                    const player = {
                        username: {},
                        onEnable: () => {},
                        getConnection: () => ({
                            sendPlayStatus: (status: any) => {
                                expect(status).toBe(2);
                                done();
                            }
                        })
                    } as any;

                    const handler = new LoginHandler();
                    await handler.handle(pk, {} as any, player);
                })();
            });
        });
    });
});
