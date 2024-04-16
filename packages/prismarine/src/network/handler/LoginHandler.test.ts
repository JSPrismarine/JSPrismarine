import { describe, expect, it, vi } from 'vitest';

import type Server from '../../Server';
import type ClientConnection from '../ClientConnection';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import LoginPacket from '../packet/LoginPacket';
import PlayStatusType from '../type/PlayStatusType';
import LoginHandler from './LoginHandler';

describe('network', () => {
    describe('handler', () => {
        describe('LoginHandler', () => {
            const server: Server = {
                getLogger: () => ({
                    debug: () => {},
                    verbose: () => {}
                }),
                getSessionManager: () => ({
                    getAllPlayers: () => [],
                    getPlayerByExactName: () => null
                }),
                getWorldManager: () => ({
                    getDefaultWorld: () => ({
                        addEntity: () => {},
                        getPlayers: () => [],
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
            } as any;

            const sessions: PlayerSession = {
                sendPlayStatus: (status: any) => {
                    expect(status).toStrictEqual(PlayStatusType.LoginSuccess);
                },
                sendDataPacket: vi.fn().mockResolvedValue({}),
                kick: (message: any) => {
                    expect(message).toBe('You have been banned!');
                },
                disconnect: vi.fn()
            } as any;

            const connection: ClientConnection = {
                getRakNetSession: vi.fn().mockReturnValue({
                    getAddress: () => ({
                        toToken: vi.fn().mockReturnValue('token')
                    })
                }),
                sendDataPacket: vi.fn().mockResolvedValue({}),
                initPlayerConnection: vi.fn().mockReturnValue(sessions),
                closePlayerSession: vi.fn().mockResolvedValue({}),
                disconnect: vi.fn()
            } as any;

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

                const handler = new LoginHandler();
                await handler.handle(pk, server, connection);
            });

            it('handle with banned with reason', async () => {
                const pk = new LoginPacket();
                pk.displayName = 'runner';
                pk.protocol = Identifiers.Protocol;

                const handler = new LoginHandler();
                await handler.handle(pk, server, connection);
            });

            it('handle invalid username', async () => {
                const pk = new LoginPacket();
                pk.displayName = '';
                pk.protocol = Identifiers.Protocol;

                const handler = new LoginHandler();
                await handler.handle(pk, server, connection);
            });

            it('handle outdated client', async () => {
                const pk = new LoginPacket();
                pk.displayName = '';
                pk.protocol = Identifiers.Protocol - 10;

                const handler = new LoginHandler();
                await handler.handle(pk, server, connection);
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
