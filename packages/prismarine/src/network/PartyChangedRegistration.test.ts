import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { stub } from '../testing/stub.test.helper';
import PartyChangedHandler from './handler/PartyChangedHandler';
import PacketRegistry from './PacketRegistry';
import PartyChangedPacket from '@jsprismarine/protocol/packet/PartyChangedPacket';

describe('PartyChangedPacket registry', () => {
    it('resolves 0x156 to a packet and a handler in the registry', async () => {
        const registry = new PacketRegistry({ getLogger: () => stub<Logger>({ debug: () => {}, verbose: () => {} }) });
        await registry['registerPackets']();
        await registry['registerHandlers']();

        expect(registry.getPackets().get(0x156)).toBe(PartyChangedPacket);
        expect(registry.getHandler('PartyChangedPacket')).toBeInstanceOf(PartyChangedHandler);
    });
});
