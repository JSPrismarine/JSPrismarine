import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { stub } from '../../testing/stub.test.helper';
import ResourcePacksReadyForValidationHandler from '../handler/ResourcePacksReadyForValidationHandler';
import PacketRegistry from '../PacketRegistry';
import ResourcePacksReadyForValidationPacket from './ResourcePacksReadyForValidationPacket';

/** The whole packet: id 340 as a two-byte varuint32 header and nothing after it. */
const BYTES = Buffer.from([0xd4, 0x02]);

describe('ResourcePacksReadyForValidationPacket', () => {
    it('writes id 340 and no payload', () => {
        const packet = new ResourcePacksReadyForValidationPacket();
        packet.encode();

        expect([...packet.getBuffer()]).toEqual([...BYTES]);
    });

    it('reads a bare header to its end', () => {
        const packet = new ResourcePacksReadyForValidationPacket(BYTES);
        packet.decode();

        expect(packet.feof()).toBe(true);
    });

    it('resolves 0x154 to a packet and a handler in the registry', async () => {
        const registry = new PacketRegistry({ getLogger: () => stub<Logger>({ debug: () => {}, verbose: () => {} }) });
        await registry['registerPackets']();
        await registry['registerHandlers']();

        expect(registry.getPackets().get(0x154)).toBe(ResourcePacksReadyForValidationPacket);
        expect(registry.getHandler('ResourcePacksReadyForValidationPacket')).toBeInstanceOf(
            ResourcePacksReadyForValidationHandler
        );
    });
});
