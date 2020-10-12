const Command = require('./PluginsCommand').default;

describe('command', () => {
    describe('jsprismarine', () => {
        describe('plugins-command', () => {
            const command = new Command();

            it('name & namespace should be set correctly', () => {
                expect(command.namespace).toBe('jsprismarine');
                expect(command.name).toBe('plugins');
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

            it('plugins command should succeed with 1 plugin', (done) => {
                command.execute({
                    getServer: () => ({
                        getPluginManager: () => ({
                            getPlugins: () => [{
                                manifest: {
                                    name: 'test1',
                                    version: '1.0.0'
                                }
                            }]
                        })
                    }),
                    sendMessage: (message: string) => {
                        expect(message).toBe(`§7Plugins (1):§r test1 1.0.0`);
                        done();
                    }
                }, []);
            });

            it('plugins command should succeed with more than 1 plugin', (done) => {
                command.execute({
                    getServer: () => ({
                        getPluginManager: () => ({
                            getPlugins: () => [{
                                manifest: {
                                    name: 'test1',
                                    version: '1.0.0'
                                }
                            }, {
                                manifest: {
                                    name: 'test2',
                                    version: '1.0.0'
                                }
                            }]
                        })
                    }),
                    sendMessage: (message: string) => {
                        expect(message).toBe(`§7Plugins (2):§r test1 1.0.0, test2 1.0.0`);
                        done();
                    }
                }, []);
            });
        });
    });
});
