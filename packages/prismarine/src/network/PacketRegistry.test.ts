import { describe, expect, it } from 'vitest';

import { Logger } from '@jsprismarine/logger';
import PacketRegistry from './PacketRegistry';

describe('network', () => {
    describe('PacketRegistry', () => {
        it('registerPackets() should not register any packets with the same ID', async () => {
            const logger = new Logger();
            const registry = new PacketRegistry({
                getLogger: () => logger
            });

            let error;
            try {
                await registry['registerPackets']();
            } catch (e) {
                error = e;
            }
            expect(error).toBeUndefined();
        });

        it('registerHandlers() should not register any handlers with the same ID', async () => {
            const logger = new Logger();
            const registry = new PacketRegistry({
                getLogger: () => logger
            });

            let error;
            try {
                await registry['registerHandlers']();
            } catch (e) {
                error = e;
            }
            expect(error).toBeUndefined();
        });
    });
});
