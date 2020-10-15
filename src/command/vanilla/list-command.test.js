const Command = require('./list-command');

describe('command', () => {
    describe('vanilla', () => {
        describe('list-command', () => {
            const command = new Command();

            it('name & namespace should be set correctly', () => {
                expect(command.id).toBe('minecraft:list');
            });

            it('list should be handled correctly with 0 players', (done) => {
                command.execute({
                    getServer: () => ({
                        getOnlinePlayers: () => [],
                        getRaknet: () => ({
                            name: {
                                getMaxPlayerCount: () => 25
                            }
                        }),
                    }),
                    sendMessage: (message) => {
                        expect(message).toBe('There are 0/25 players online:');
                        done();
                    }
                }, null);
            });

            it('list should be handled correctly with 1 player', (done) => {
                let step = 0;

                command.execute({
                    getServer: () => ({
                        getOnlinePlayers: () => [{
                            name: 'test-user'
                        }],
                        getRaknet: () => ({
                            name: {
                                getMaxPlayerCount: () => 25
                            }
                        }),
                    }),
                    sendMessage: (message) => {
                        switch (step) {
                            case 0:
                                expect(message).toBe('There are 1/25 players online:');
                                break;
                            case 1:
                                expect(message).toBe('test-user');
                                done();
                        }
                        step += 1;
                    }
                }, null);
            });
        });
    });
});
