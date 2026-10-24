import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import SyncedPlayerMovementSettings from './SyncedPlayerMovementSettings';

describe('SyncedPlayerMovementSettings', () => {
    // Rewind History Size 40 as a zigzag varint (80 = 0x50), then the block breaking flag.
    // Nothing in front: the retired movement mode byte is not on the 2193 wire.
    const BDS_BYTES = Buffer.from([0x50, 0x01]);

    it('writes a rewind size and a flag, and nothing else', () => {
        const stream = new NetworkBinaryStream();
        new SyncedPlayerMovementSettings(40, true).serialize(stream);

        expect(stream.getBuffer()).toEqual(BDS_BYTES);
    });

    it('reads the two fields and consumes exactly them', () => {
        const stream = new NetworkBinaryStream(BDS_BYTES);
        const settings = new SyncedPlayerMovementSettings(0, false);
        settings.deserialize(stream);

        expect(settings.rewindHistorySize).toBe(40);
        expect(settings.serverAuthoritativeBlockBreaking).toBe(true);
        expect(stream.feof()).toBe(true);
    });
});
