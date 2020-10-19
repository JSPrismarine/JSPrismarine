const Command = require('./GamemodeCommand').default;

describe('command', () => {
    describe('vanilla', () => {
        describe('GamemodeCommand', () => {
            const command = new Command();

            it('name & namespace should be set correctly', () => {
                expect(command.id).toBe('minecraft:gamemode');
            });

            it('gamemode command should fail without argument', (done) => {
                command.execute({
                    sendMessage: (message) => {
                        expect(message).toBe('§cYou have to specify a gamemode.');
                        done();
                    }
                }, []);
            });

            it.skip('gamemode command should fail with invalid gamemode', (done) => {
                command.execute({
                    sendMessage: (message) => {
                        expect(message).toBe('§cInvalid gamemode specified.');
                        done();
                    }
                }, ['test']);
            });

            it('gamemode command should fail when using one argument from console', (done) => {
                command.execute({
                    sendMessage: (message) => {
                        expect(message).toBe('§cYou have to run this command in-game!');
                        done();
                    }
                }, ['creative']);
            });

            it('gamemode command should fail when using offline player', (done) => {
                command.execute({
                    getServer: () => ({
                        getPlayerByName: (name) => null,
                    }),
                    sendMessage: (message) => {
                        expect(message).toBe('§cNo player was found');
                        done();
                    }
                }, ['creative', 'test-user']);
            });

            it('gamemode command should work when running from console', (done) => {
                command.execute({
                    getServer: () => ({
                        getPlayerByName: (name) => ({
                            name: name,
                            setGamemode: (gamemode) => expect(gamemode).toBe(1),
                            sendCreativeContents: () => null,
                            sendMessage: (message) => {
                                expect(message).toBe(`Your game mode has been updated to Creative Mode`);
                            }
                        }),
                    }),
                    sendMessage: (message) => {
                        expect(message).toBe(`Set test-user's game mode to Creative Mode`);
                        done();
                    }
                }, ['creative', 'test-user']);
            });
        });
    });
});
