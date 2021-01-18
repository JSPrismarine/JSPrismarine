import LoggerBuilder from '../utils/Logger';
import PluginManager from './PluginManager';
import Server from '../Server';
import mock from 'mock-fs';
import path from 'path';

jest.mock('winston', () => ({
    format: {
        colorize: jest.fn(),
        combine: jest.fn(),
        label: jest.fn(),
        timestamp: jest.fn(),
        simple: jest.fn(),
        printf: jest.fn()
    },
    createLogger: jest.fn().mockReturnValue({
        silly: jest.fn(),
        debug: jest.fn(),
        log: jest.fn(),
        info: jest.fn()
    }),
    transports: {
        Console: jest.fn(),
        File: jest.fn()
    }
}));

describe.skip('plugin', () => {
    describe('PluginManager', () => {
        let server: any;
        beforeAll(() => {
            const logger = new LoggerBuilder();

            server = new Server({
                logger,
                config: new (class DebugConfig {
                    public getPort() {
                        return 19199;
                    }

                    public getServerIp() {
                        return '0.0.0.0';
                    }

                    public getLevelName() {
                        return '';
                    }

                    public getWorlds() {
                        return {};
                    }

                    public getMaxPlayers() {
                        return 1;
                    }

                    public getGamemode() {
                        return 1;
                    }

                    public getMotd() {
                        return 'CI';
                    }

                    public getViewDistance() {
                        return 4;
                    }

                    public getOnlineMode() {
                        return false;
                    }

                    public getEnableEval() {
                        return false;
                    }

                    public getTelemetry() {
                        return {
                            enabled: false,
                            urls: []
                        };
                    }

                    public getPacketCompressionLevel() {
                        return 7;
                    }
                })() as any
            });
        });
        afterEach(() => {
            mock.restore();
        });

        it('onEnable() should succeed with 0 plugins', async (done) => {
            const pl = new PluginManager(server);
            // Mock file-system
            mock({
                'src/plugin/api': mock.load(
                    path.resolve(process.cwd(), 'src/plugin/api'),
                    { recursive: true }
                ),
                node_modules: mock.load(
                    path.resolve(__dirname, '../../node_modules')
                )
            });

            await pl.onEnable();
            expect(pl.getPlugins().length).toEqual(0);
            done();
        });

        it('onEnable() should succeed with valid plugin', async (done) => {
            const pl = new PluginManager(server);

            // Mock file-system
            mock({
                plugins: mock.load(
                    path.resolve(process.cwd(), '.test/plugins')
                ),
                'src/plugin/api': mock.load(
                    path.resolve(process.cwd(), 'src/plugin/api'),
                    { recursive: true }
                ),
                node_modules: mock.load(
                    path.resolve(__dirname, '../../node_modules')
                )
            });

            await pl.onEnable();
            expect(pl.getPlugins().length).toEqual(1);
            expect(pl.getPlugins()[0].displayName).toBe('ci');
            done();
        });
    });
});
