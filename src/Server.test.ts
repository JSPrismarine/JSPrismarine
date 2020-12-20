import LoggerBuilder from './utils/Logger';
import Server from './Server';

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

describe('Prismarine', () => {
    it('server to start & exit properly', async (done) => {
        jest.setTimeout(30000);

        const getRandomInt = (min: number, max: number) => {
            min = Math.ceil(min);
            max = Math.floor(max);
            return Math.floor(Math.random() * (max - min + 1)) + min;
        };

        const logger = new LoggerBuilder();
        const prismarine = new Server({
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

        const mockExit = jest
            .spyOn(process, 'exit')
            .mockImplementation((() => {}) as any);

        await prismarine.listen('0.0.0.0', getRandomInt(46000, 49999));
        await prismarine.kill();
        expect(mockExit).toHaveBeenCalledWith(0);
        done();
    });
});
