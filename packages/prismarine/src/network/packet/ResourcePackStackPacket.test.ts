import { describe, expect, it } from 'vitest';
import { netIdFor } from '../codec/v2193';

import Identifiers from '../Identifiers';
import ResourcePackStackPacket from './ResourcePackStackPacket';

/**
 * The packet with one pack and one experiment, written by hand in the order the protocol
 * 2193 docs list the fields. Header byte included.
 */
const ONE_PACK_ONE_EXPERIMENT = [
    0x07, // header, packet id 7
    0x00, // Texture Pack Required
    0x01, // Texture Pack List count, a varuint
    ...[0x04, 0x61, 0x61, 0x61, 0x61], // Pack ID 'aaaa'
    ...[0x05, 0x31, 0x2e, 0x30, 0x2e, 0x30], // Version '1.0.0'
    0x00, // Sub Pack Name ''
    ...[0x01, 0x2a], // Base Game Version '*'
    ...[0x01, 0x00, 0x00, 0x00], // Toggles count, uint32 little endian
    ...[0x01, 0x78], // Name 'x'
    0x01, // Enabled
    0x01, // ExperimentsEverToggled
    0x00 // Include Editor Packs
];

/** No packs, no experiments. Eleven bytes, as a client on 2193 expects. */
const EMPTY_STACK = [0x07, 0x00, 0x00, 0x01, 0x2a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

describe('network', () => {
    describe('packet', () => {
        describe('ResourcePackStackPacket', () => {
            it('encodes one pack and one experiment in docs order', () => {
                const pk = new ResourcePackStackPacket();
                pk.texturePackRequired = false;
                pk.texturePackList = [{ packId: 'aaaa', version: '1.0.0', subPackName: '' }];
                pk.baseGameVersion = '*';
                pk.experiments = [{ name: 'x', enabled: true }];
                pk.experimentsAlreadyEnabled = true;
                pk.includeEditorPacks = false;
                pk.encode();

                expect([...pk.getBuffer()]).toEqual(ONE_PACK_ONE_EXPERIMENT);
            });

            it('encodes the default packet as an eleven byte empty stack', () => {
                const pk = new ResourcePackStackPacket();
                pk.encode();

                expect([...pk.getBuffer()]).toEqual(EMPTY_STACK);
            });

            it('decodes the hand built buffer and consumes every byte', () => {
                const pk = new ResourcePackStackPacket();
                pk.setReadBuffer(Buffer.from(ONE_PACK_ONE_EXPERIMENT));
                pk.decode();

                expect(pk.texturePackRequired).toBe(false);
                expect(pk.texturePackList).toEqual([{ packId: 'aaaa', version: '1.0.0', subPackName: '' }]);
                expect(pk.baseGameVersion).toBe('*');
                expect(pk.experiments).toEqual([{ name: 'x', enabled: true }]);
                expect(pk.experimentsAlreadyEnabled).toBe(true);
                expect(pk.includeEditorPacks).toBe(false);
                expect(pk.feof()).toBe(true);
            });

            it('uses the network id the client expects', () => {
                expect(netIdFor('ResourcePackStackPacket')).toBe(Identifiers.ResourcePackStackPacket);
                expect(netIdFor('ResourcePackStackPacket')).toBe(0x07);
            });
        });
    });
});
