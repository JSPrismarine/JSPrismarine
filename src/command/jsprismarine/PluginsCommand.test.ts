const Command = require('./PluginsCommand').default;

describe('command', () => {
    describe('jsprismarine', () => {
        describe('PluginsCommand', () => {
            const command = new Command();

            it('name & namespace should be set correctly', () => {
                expect(command.id).toBe('jsprismarine:plugins');
            });

            it('plugins command should fail with no plugins', (done) => {
                command.execute({
                    getServer: () => ({
                        getPluginManager: () => ({
                            getPlugins: () => []
                        })
                    }),
                    sendMessage: (message: string) => {
                        expect(message).toBe(`§cCan't find any plugins.`);
                        done();
                    }
                }, []);
            });
        });
    });
});
