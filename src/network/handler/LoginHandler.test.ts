import Identifiers from '../Identifiers';
import LoginPacket from '../packet/LoginPacket';
import LoginHandler from './LoginHandler';

describe('network', () => {
    describe('handler', () => {
        describe('LoginHandler', () => {
            it('handle with non-banned', (done) => {
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
                handler.handle(
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

            it('handle with banned without reason', (done) => {
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
                handler.handle(
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

            it('handle with banned with reason', (done) => {
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
                handler.handle(
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
        });
    });
});
