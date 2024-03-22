import { describe, it, expect, vi } from 'vitest';

import LoggerBuilder from './utils/Logger';
import Server from './Server';

/* vi.mock('winston', () => ({
    format: {
        colorize: vi.fn(),
        combine: vi.fn(),
        label: vi.fn(),
        timestamp: vi.fn(),
        simple: vi.fn(),
        printf: vi.fn()
    },
    createLogger: vi.fn().mockReturnValue({
        silly: vi.fn(),
        debug: vi.fn(),
        log: vi.fn(),
        info: vi.fn()
    }),
    transports: {
        Console: vi.fn(),
        File: vi.fn()
    }
})); */

describe('Prismarine', () => {
    it.skip('server to start & exit properly', async () => {
        const getRandomInt = (min: number, max: number) => {
            min = Math.ceil(min);
            max = Math.floor(max);
            return Math.floor(Math.random() * (max - min + 1)) + min;
        };

        const logger = new LoggerBuilder();
        const prismarine = new Server({
            version: 'test',
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

                public getPacketCompressionLevel() {
                    return 7;
                }
            })() as any
        });

        const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

        await prismarine.bootstrap('0.0.0.0', getRandomInt(46000, 49999));
        await prismarine.shutdown();
        expect(mockExit).toHaveBeenCalledWith(0);
    });
});
