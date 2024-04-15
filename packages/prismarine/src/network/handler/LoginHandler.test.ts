import { describe, expect, it, vi } from 'vitest';

import type Server from '../../Server';
import Identifiers from '../Identifiers';
import LoginPacket from '../packet/LoginPacket';
import PlayStatusType from '../type/PlayStatusType';
import LoginHandler from './LoginHandler';

describe('network', () => {
    describe('handler', () => {
        const server: Server = vi.fn().mockImplementation(() => ({
            getLogger: () => ({
                debug: () => {},
                verbose: () => {}
            }),
            getSessionManager: () => ({
                getAllPlayers: () => []
            }),
            getWorldManager: () => ({
                getDefaultWorld: () => ({
                    addEntity: () => {},
                    getPlayerData(_player: any) {
                        return { position: { x: 0, y: 0, z: 0 }, inventory: [] };
                    }
                })
            }),
            getConfig: () => ({
                getOnlineMode: () => false,
                getGamemode: () => 'survival'
            }),
            getPermissionManager: () => ({
                getPermissions(_player: any) {
                    return null;
                }
            }),
            getBanManager: () => ({
                isBanned: (_player: any) => {
                    return false;
                }
            }),
            getTick: () => 0,
            on: vi.fn(),
            post: vi.fn(),
            emit: vi.fn().mockResolvedValue({})
        }))();

        const connection = vi.fn().mockImplementation(() => ({
            getRakNetSession: vi.fn().mockReturnValue({
                getAddress: () => ({
                    toToken: vi.fn().mockReturnValue('token')
                })
            }),
            sendDataPacket: vi.fn(),
            initPlayerConnection: vi.fn().mockReturnValue({
                sendPlayStatus: (status: any) => {
                    expect(status).toStrictEqual(PlayStatusType.LoginSuccess);
                }
            })
        }))();

        describe('LoginHandler', () => {
            it('handle with non-banned', async () => {
                const pk = new LoginPacket();
                pk.displayName = 'runner';
                pk.protocol = Identifiers.Protocol;

                const handler = new LoginHandler();
                await handler.handle(pk, server, connection);
            });

            it('handle with banned without reason', async () => {
                const pk = new LoginPacket();
                pk.displayName = 'runner';
                pk.protocol = Identifiers.Protocol;

                const player = {
                    onEnable: vi.fn(),
                    getConnection: () => ({
                        sendPlayStatus: (status: any) => {
                            expect(status).toBe(0);
                        },
                        sendDataPacket: (_packet: any) => {
                            expect(player.username.name).toStrictEqual({
                                name: 'runner'
                            });
                        },
                        getRakNetSession: () => ({
                            getAddress: () => ({
                                toToken: () => {
                                    return 'token';
                                }
                            })
                        }),
                        initPlayerConnection: (_server: any, _player: any) => ({
                            sendPlayStatus: (status: any) => {
                                expect(status).toStrictEqual(PlayStatusType.LoginSuccess);
                            }
                        })
                    }),
                    kick: (message: any) => {
                        expect(message).toBe('You have been banned!');
                    },
                    getRakNetSession: () => ({
                        getAddress: () => {}
                    }),
                    initPlayerConnection: (_server: any, _player: any) => ({
                        sendPlayStatus: (_status: any) => {}
                    }),
                    sendDataPacket: (_packet: any) => {}
                } as any;

                const handler = new LoginHandler();
                await handler.handle(pk, server, player);
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
                        },
                        sendDataPacket: (_packet: any) => {
                            expect(player.username.name).toStrictEqual({
                                name: 'runner'
                            });
                        },
                        getRakNetSession: () => ({
                            getAddress: () => ({
                                toToken: () => {
                                    return 'token';
                                }
                            })
                        }),
                        initPlayerConnection: (_server: any, _player: any) => ({
                            sendPlayStatus: (status: any) => {
                                expect(status).toStrictEqual(PlayStatusType.LoginSuccess);
                            }
                        })
                    }),
                    kick: (message: any) => {
                        expect(message).toBe('You have been banned for reason: a reason!');
                    },
                    getRakNetSession: () => ({
                        getAddress: () => {}
                    }),
                    initPlayerConnection: (_server: any, _player: any) => ({
                        sendPlayStatus: (_status: any) => {}
                    }),
                    sendDataPacket: (_packet: any) => {}
                } as any;

                const handler = new LoginHandler();
                await handler.handle(pk, server, player);
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
                        },
                        sendDataPacket: (_packet: any) => {
                            expect(player.username.name).toStrictEqual({
                                name: 'runner'
                            });
                        },
                        getRakNetSession: () => ({
                            getAddress: () => ({
                                toToken: () => {
                                    return 'token';
                                }
                            })
                        }),
                        initPlayerConnection: (_server: any, _player: any) => ({
                            sendPlayStatus: (status: any) => {
                                expect(status).toStrictEqual(PlayStatusType.LoginSuccess);
                            }
                        })
                    }),
                    kick: (message: any) => {
                        expect(message).toBe('Invalid username!');
                    },
                    disconnect: (_reason: any, _hideReason: any) => {}
                } as any;

                const handler = new LoginHandler();
                await handler.handle(pk, server, player);
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
                            expect(status).toBe(0);
                        },
                        sendDataPacket: (_packet: any) => {
                            expect(player.username.name).toStrictEqual({
                                name: 'runner'
                            });
                        },
                        getRakNetSession: () => ({
                            getAddress: () => ({
                                toToken: () => {
                                    return 'token';
                                }
                            })
                        }),
                        initPlayerConnection: (_server: any, _player: any) => ({
                            sendPlayStatus: (status: any) => {
                                expect(status).toStrictEqual(PlayStatusType.LoginSuccess);
                            }
                        })
                    }),
                    sendDataPacket: (packet: any) => {
                        expect(packet.getName()).toBe('PlayStatusPacket');
                    }
                } as any;

                const handler = new LoginHandler();
                await handler.handle(pk, server, player);
            });

            it('handle outdated server', async () => {
                const pk = new LoginPacket();
                pk.displayName = '';
                pk.protocol = Identifiers.Protocol + 10;

                const connection = {
                    sendDataPacket: (_packet: any) => {}
                } as any;

                const handler = new LoginHandler();
                await handler.handle(pk, server, connection);
            });
        });
    });
});
