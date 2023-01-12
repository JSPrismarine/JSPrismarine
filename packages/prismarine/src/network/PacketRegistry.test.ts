import LoggerBuilder from '../utils/Logger.js';
import PacketRegistry from './PacketRegistry.js';

describe('network', () => {
    describe('PacketRegistry', () => {
        it('registerPackets() should not register any packets with the same ID', async () => {
            const logger = new LoggerBuilder();
            const registry = new PacketRegistry({
                getLogger: () => logger
            } as any);

            let error;
            try {
                await (registry as any).registerPackets();
            } catch (e) {
                error = e;
            }
            expect(error).toBeUndefined();
        });

        it('registerHandlers() should not register any handlers with the same ID', async () => {
            const logger = new LoggerBuilder();
            const registry = new PacketRegistry({
                getLogger: () => logger
            } as any);

            let error;
            try {
                await (registry as any).registerHandlers();
            } catch (e) {
                error = e;
            }
            expect(error).toBeUndefined();
        });
    });
});
