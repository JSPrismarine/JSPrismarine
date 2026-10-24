import { Vector3 } from '@jsprismarine/math';
import { Dimension } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import ChangeDimensionPacket from './ChangeDimensionPacket';

/** Header, Dimension ID, Position, Respawn, Loading Screen Id. */
const WITHOUT_SCREEN = [
    0x3d, // Header: id 61, no subclient ids.
    0x02, // Dimension ID: the Nether (1) as a ZigZag varint
    0x00,
    0x00,
    0x00,
    0x00, // Position X: 0
    0x00,
    0x00,
    0x80,
    0x42, // Position Y: 64
    0x00,
    0x00,
    0x00,
    0x00, // Position Z: 0
    0x01, // Respawn
    0x00 // Loading Screen Id absent
];

describe('network', () => {
    describe('packet', () => {
        describe('ChangeDimensionPacket', () => {
            it('writes a presence byte and nothing else when there is no loading screen', () => {
                const pk = new ChangeDimensionPacket();
                pk.dimension = Dimension.NETHER;
                pk.position = new Vector3(0, 64, 0);
                pk.respawn = true;
                pk.encode();

                expect([...pk.getBuffer()]).toEqual(WITHOUT_SCREEN);
            });

            it('writes the loading screen id as a little endian uint32 after its presence byte', () => {
                const pk = new ChangeDimensionPacket();
                pk.dimension = Dimension.NETHER;
                pk.position = new Vector3(0, 64, 0);
                pk.respawn = true;
                pk.loadingScreenId = 0x01020304;
                pk.encode();

                expect([...pk.getBuffer()]).toEqual([
                    ...WITHOUT_SCREEN.slice(0, -1),
                    0x01, // Loading Screen Id present
                    0x04,
                    0x03,
                    0x02,
                    0x01
                ]);
            });

            it('reads a hand-built buffer to its end', () => {
                const pk = new ChangeDimensionPacket();
                pk.setReadBuffer(Buffer.from(WITHOUT_SCREEN));
                pk.decode();

                expect(pk.dimension).toBe(Dimension.NETHER);
                expect(pk.position?.getY()).toBeCloseTo(64, 6);
                expect(pk.respawn).toBe(true);
                expect(pk.loadingScreenId).toBeNull();
                expect(pk.feof()).toBe(true);
            });

            it('uses the network id the client expects', () => {
                expect(ChangeDimensionPacket.NetID).toBe(Identifiers.ChangeDimensionPacket);
                expect(ChangeDimensionPacket.NetID).toBe(0x3d);
            });
        });
    });
});
