import Identifiers from '../Identifiers';
import LoginHandler from './LoginHandler';
import LoginPacket from '../packet/LoginPacket';

describe('network', () => {
    describe('handler', () => {
        describe('LoginHandler', () => {
            it('handle with non-banned', async () => {
                const pk = new LoginPacket();
                pk.displayName = 'runner';
                pk.protocol = Identifiers.Protocol;

                const connection = {
                    getRakNetSession: () => ({
                        getAddress: () => ({
                            toToken: () => {
                                return 'token'
                            }
                        })
                    }),
                    sendDataPacket: (packet: any) => {
                        expect(player.username).toStrictEqual({
                            name: 'runner'
                        });
                    }
                } as any;

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
                        }
                    }),
                    kick: (message: any) => {
                        expect(message).toBe('You have been banned!');
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
                        getLogger: () => {
                            return null;
                        },
                        getEventManager: () => ({
                            on: (event: any, handler: any) => {}
                        }),
                        getWorldManager: () => ({
                            getDefaultWorld: () => ({
                                addEntity: () => {},
                                getPlayerData(player: any) {
                                    return { position: { x: 0, y: 0, z: 0 }, inventory: [] };
                                } 
                            })
                        }),
                        getPermissionManager: () => ({
                            getPermissions(player: any) {
                                return null;
                            }
                        }),
                        getPlayerByExactName(name: string) {
                            return null;
                        }
                    } as any,
                    connection
                );
            });

            it('handle with banned without reason', async () => {
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
            });

            it('handle with banned with reason', async () => {
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
            });

            it('handle invalid username', async () => {
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
                    }
                } as any;

                const handler = new LoginHandler();
                await handler.handle(pk, {} as any, player);
            });

            it('handle outdated client', async () => {
                const pk = new LoginPacket();
                pk.displayName = '';
                pk.protocol = Identifiers.Protocol - 10;

                const player = {
                    username: {},
                    onEnable: () => {},
                    getConnection: () => ({
                        sendPlayStatus: (status: any) => {
                            expect(status).toBe(1);
                        }
                    })
                } as any;

                const handler = new LoginHandler();
                await handler.handle(pk, {} as any, player);
            });

            it('handle outdated server', async () => {
                const pk = new LoginPacket();
                pk.displayName = '';
                pk.protocol = Identifiers.Protocol + 10;

                const player = {
                    username: {},
                    onEnable: () => {},
                    getConnection: () => ({
                        sendPlayStatus: (status: any) => {
                            expect(status).toBe(2);
                        }
                    })
                } as any;

                const handler = new LoginHandler();
                await handler.handle(pk, {} as any, player);
            });
        });
    });
});
