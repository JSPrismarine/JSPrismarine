import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import ResourcePacksInfoPacket from './ResourcePacksInfoPacket';

describe('network', () => {
    describe('packet', () => {
        describe('ResourcePacksInfoPacket', () => {
            const encode = (mutate: (pk: ResourcePacksInfoPacket) => void = () => {}) => {
                const pk = new ResourcePacksInfoPacket();
                pk.resourcePackRequired = false;
                pk.hasAddonPacks = false;
                pk.hasScripts = false;
                mutate(pk);
                pk.encode();
                return pk.getBuffer();
            };

            /** A uuid of all zeroes and an empty version: this world came from no template. */
            const NO_WORLD_TEMPLATE = [...Array.from({ length: 16 }, () => 0x00), 0x00];

            it('encodes exactly the fields protocol 2168 defines', () => {
                const payload = encode().subarray(1); // drop the packet id header

                expect([...payload]).toEqual([
                    0x00, // must_accept
                    0x00, // has_addons
                    0x00, // has_scripts
                    0x00, // force_disable_vibrant_visuals, added at 2168
                    ...NO_WORLD_TEMPLATE, // world template id and version, added at 2168
                    0x00 // texture_packs count, a varint where 748 wrote a little endian short
                ]);
            });

            it('carries the flags it is given', () => {
                const payload = encode((pk) => {
                    pk.resourcePackRequired = true;
                    pk.hasAddonPacks = false;
                    pk.hasScripts = true;
                }).subarray(1);

                expect([...payload]).toEqual([0x01, 0x00, 0x01, 0x00, ...NO_WORLD_TEMPLATE, 0x00]);
            });

            it('uses the network id the client expects', () => {
                expect(ResourcePacksInfoPacket.NetID).toBe(Identifiers.ResourcePacksInfoPacket);
                expect(ResourcePacksInfoPacket.NetID).toBe(0x06);
            });
        });
    });
});
