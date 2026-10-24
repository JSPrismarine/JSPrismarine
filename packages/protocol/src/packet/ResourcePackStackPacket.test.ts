import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ResourcePackStackPacket from './ResourcePackStackPacket';

import type { ResourcePackStack } from './ResourcePackStackPacket';

/**
 * The packet with one pack and one experiment, written by hand in the order the protocol
 * 2193 docs list the fields. Header byte included.
 */
const ONE_PACK_ONE_EXPERIMENT = Buffer.from([
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
]);

/** No packs, no experiments. Eleven bytes, as a client on 2193 expects. */
const EMPTY_STACK = Buffer.from([0x07, 0x00, 0x00, 0x01, 0x2a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const ONE_PACK_ONE_EXPERIMENT_DATA: ResourcePackStack = {
    texturePackRequired: false,
    texturePacks: [{ uuid: 'aaaa', version: '1.0.0', subPackName: '' }],
    gameVersion: '*',
    experiments: [{ name: 'x', enabled: true }],
    experimentsAlreadyEnabled: true,
    includeEditorPacks: false
};

const EMPTY_STACK_DATA: ResourcePackStack = {
    texturePackRequired: false,
    texturePacks: [],
    gameVersion: '*',
    experiments: [],
    experimentsAlreadyEnabled: false,
    includeEditorPacks: false
};

const encode = (data: ResourcePackStack): Buffer =>
    new ResourcePackStackPacket(data).serialize(new NetworkBinaryStream());

describe('ResourcePackStackPacket', () => {
    it('writes one pack and one experiment in docs order', () => {
        expect(encode(ONE_PACK_ONE_EXPERIMENT_DATA)).toEqual(ONE_PACK_ONE_EXPERIMENT);
    });

    it('writes an empty stack as eleven bytes', () => {
        expect(encode(EMPTY_STACK_DATA)).toEqual(EMPTY_STACK);
    });

    it('reads the hand built buffer and nothing past it', () => {
        const stream = new NetworkBinaryStream(ONE_PACK_ONE_EXPERIMENT);
        const data = new ResourcePackStackPacket().deserialize(stream);

        expect(data).toEqual(ONE_PACK_ONE_EXPERIMENT_DATA);
        expect(stream.feof()).toBe(true);
    });
});
