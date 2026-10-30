import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { stub } from '../testing/stub.test.helper';
import PartyChangedHandler from './handler/PartyChangedHandler';
import PacketHandlerRegistry from './PacketHandlerRegistry';

describe('PartyChangedHandler registry', () => {
    it('registers the handler for PartyChangedPacket', async () => {
        const registry = new PacketHandlerRegistry({
            getLogger: () => stub<Logger>({ debug: () => {}, verbose: () => {} })
        });
        await registry.enable();

        expect(registry.getHandler('PartyChangedPacket')).toBeInstanceOf(PartyChangedHandler);
    });
});
