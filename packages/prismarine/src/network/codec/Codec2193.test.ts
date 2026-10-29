import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import SetTimePacket from '../packet/SetTimePacket';
import * as Packets from '../Packets';
import Codec2193 from './Codec2193';
import { codecForProtocol, latestCodec } from './CodecRegistry';

describe('network/codec', () => {
    describe('Codec2193', () => {
        it('speaks protocol 2193 for the versions Identifiers has always listed', () => {
            expect(Codec2193.protocolVersion).toBe(2193);
            expect(Identifiers.Protocol).toBe(Codec2193.protocolVersion);
            expect(Identifiers.MinecraftVersions).toBe(Codec2193.minecraftVersions);
        });

        it('lists every packet id under its class name, each id once', () => {
            const entries = Object.entries(Codec2193.ids);
            const implemented = new Set(Object.keys(Packets));
            expect(entries.length).toBeGreaterThan(0);
            for (const [name, id] of entries) {
                expect(Codec2193.netIdOf(name), name).toBe(id);
                // Ids without a class are protocol surface the server has not implemented;
                // the codec resolves exactly the ones the barrel exports.
                if (implemented.has(name)) expect(Codec2193.createPacket(id)?.getName(), name).toBe(name);
                else expect(Codec2193.createPacket(id), name).toBeNull();
            }
            expect(new Set(entries.map(([, id]) => id)).size).toBe(entries.length);
        });

        it('builds a packet that decodes the bytes it was given', () => {
            const outbound = new SetTimePacket();
            outbound.time = 4321;
            outbound.encode();

            const inbound = Codec2193.createPacket(Codec2193.netIdOf('SetTimePacket')!, outbound.getBuffer());
            expect(inbound).toBeInstanceOf(SetTimePacket);
            inbound!.decode();
            expect(inbound).toMatchObject({ time: 4321 });
        });

        it('returns null for an id it does not list', () => {
            expect(Codec2193.createPacket(0x3ff)).toBeNull();
        });
    });

    describe('CodecRegistry', () => {
        it('resolves 2193 and nothing else, and names 2193 the latest', () => {
            expect(codecForProtocol(2193)).toBe(Codec2193);
            expect(codecForProtocol(1)).toBeUndefined();
            expect(latestCodec).toBe(Codec2193);
        });
    });
});
