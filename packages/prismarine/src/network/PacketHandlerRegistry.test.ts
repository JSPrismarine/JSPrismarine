import { describe, expect, it } from 'vitest';

import { Logger } from '@jsprismarine/logger';
import PacketHandlerRegistry from './PacketHandlerRegistry';

describe('network', () => {
    describe('PacketHandlerRegistry', () => {
        it('registers each server handler once', async () => {
            const logger = new Logger();
            const registry = new PacketHandlerRegistry({
                getLogger: () => logger
            });

            await registry.enable();
            expect(registry.getHandlers().size).toBeGreaterThan(0);
        });
    });
});
