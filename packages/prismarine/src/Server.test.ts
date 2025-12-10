import { describe, expect, it, vi } from 'vitest';

import { Logger } from '@jsprismarine/logger';
import Server from './Server';

describe('Server', () => {
    vi.mock('@jsprismarine/raknet', async (importActual) => {
        const MockRakNetListener = vi.fn(function (this: any) {
            this.start = vi.fn();
            this.on = vi.fn();
        });
        return {
            ...(((await importActual()) as any) || {}),
            RakNetListener: MockRakNetListener
        };
    });

    const config = new (class DebugConfig {
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

        public getEnableTicking() {
            return false;
        }

        public getEnableProcessTitle() {
            return false;
        }

        public getPacketCompressionLevel() {
            return 7;
        }
    })() as any;

    it('starts and stops without crashing', async () => {
        const logger = new Logger();
        const prismarine = new Server({
            logger,
            config
        });

        const mockExit = vi.spyOn(prismarine, 'shutdown').mockImplementation((() => {}) as any);

        await prismarine.bootstrap('0.0.0.0', 12345);
        await expect(() => prismarine.shutdown()).not.toThrow();
        expect(mockExit).toBeCalledTimes(1);
    });

    it('starts and stops without crashing in headless mode', async () => {
        const logger = new Logger();
        const prismarine = new Server({
            logger,
            config,
            headless: true
        });

        const mockExit = vi.spyOn(prismarine, 'shutdown').mockImplementation((() => {}) as any);

        await prismarine.bootstrap('0.0.0.0', 12345);
        await expect(() => prismarine.shutdown()).not.toThrow();
        expect(mockExit).toBeCalledTimes(1);
    });
});
