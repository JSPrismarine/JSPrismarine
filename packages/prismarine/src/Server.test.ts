import { describe, expect, it, vi } from 'vitest';

import { Logger } from '@jsprismarine/logger';
import Server from './Server';

describe('Prismarine', () => {
    it('server to start & exit properly', async () => {
        const getRandomInt = (min: number, max: number) => {
            min = Math.ceil(min);
            max = Math.floor(max);
            return Math.floor(Math.random() * (max - min + 1)) + min;
        };

        const logger = new Logger();
        const prismarine = new Server({
            logger,
            config: new (class DebugConfig {
                public enable() {}
                public disable() {}

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

        const mockExit = vi.spyOn(prismarine, 'shutdown').mockImplementation((() => {}) as any);

        await prismarine.bootstrap('0.0.0.0', getRandomInt(46000, 49999));
        await prismarine.shutdown();
        expect(mockExit).toBeCalledTimes(1);
    });
});
