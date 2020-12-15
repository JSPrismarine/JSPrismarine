import Prismarine from './Prismarine';
import LoggerBuilder from './utils/Logger';

describe('Prismarine', () => {
    it.skip('server to start up properly', async (done) => {
        const logger = new LoggerBuilder();
        const prismarine = new Prismarine({
            logger,
            config: new (class DebugConfig {
                public getPort() {
                    return 19199;
                }
                public getServerIp() {
                    return '0.0.0.0';
                }
                public getLevelName() {
                    return 'ci';
                }
                public getWorlds() {
                    return {
                        ci: {
                            generator: 'flat',
                            seed: 1234
                        }
                    };
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

        const mockExit = jest
            .spyOn(process, 'exit')
            .mockImplementation((() => {}) as any);

        await prismarine.listen('0.0.0.0', 19199);
        await prismarine.kill();
        expect(mockExit).toHaveBeenCalledWith(0);
        done();
    });
});
