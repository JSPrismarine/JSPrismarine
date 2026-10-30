import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { stub } from '../../testing/stub.test.helper';
import ClientCacheStatusHandler from './ClientCacheStatusHandler';
import PacketHandlerRegistry from '../PacketHandlerRegistry';
import ClientCacheStatusPacket from '@jsprismarine/protocol/packet/ClientCacheStatusPacket';

/**
 * The one-bool packet every client sends after login.
 *
 * Until it was registered the server warned `Packet 0x81 isn't implemented` on every join,
 * which is noise in the log of a join that is failing for another reason.
 */
describe('ClientCacheStatusPacket', () => {
    const roundTrip = (enabled: boolean): ClientCacheStatusPacket => {
        const sent = new ClientCacheStatusPacket();
        sent.enabled = enabled;
        sent.encode();

        const received = new ClientCacheStatusPacket(sent.getBuffer());
        received.decode();

        return received;
    };

    it('carries the offer through an encode and decode', () => {
        expect(roundTrip(true).enabled).toBe(true);
        expect(roundTrip(false).enabled).toBe(false);
    });

    it('encodes the flag as a single byte after the header', () => {
        const encoded = (enabled: boolean): Buffer => {
            const packet = new ClientCacheStatusPacket();
            packet.enabled = enabled;
            packet.encode();

            return packet.getBuffer();
        };

        const on = encoded(true);
        const off = encoded(false);

        expect(on.length).toBe(off.length);
        expect(on.at(-1)).toBe(1);
        expect(off.at(-1)).toBe(0);
    });

    it('resolves 0x81 to a packet and a handler in the registry', async () => {
        const registry = new PacketHandlerRegistry({
            getLogger: () => stub<Logger>({ debug: () => {}, verbose: () => {} })
        });
        await registry.enable();

        expect(registry.getHandler('ClientCacheStatusPacket')).toBeInstanceOf(ClientCacheStatusHandler);
    });
});
