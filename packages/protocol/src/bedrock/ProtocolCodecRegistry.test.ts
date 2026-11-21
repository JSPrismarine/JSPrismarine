import { describe, expect, it } from 'vitest';

import { createProtocolCodecRegistry } from './ProtocolCodecRegistry';

import type { ProtocolCodec } from './ProtocolCodec';

const codec = (protocolVersion: number, preview?: boolean): ProtocolCodec => ({
    protocolVersion,
    minecraftVersions: [`1.0.${protocolVersion}`],
    preview,
    ids: {},
    itemData: { protocolVersion, table: {}, components: {}, nameOf: () => undefined },
    context: { protocolVersion },
    createPacket: () => null,
    prepareOutbound: (packet) => packet,
    netIdOf: () => undefined
});

describe('createProtocolCodecRegistry', () => {
    it('advertises the newest release and negotiates the newer preview', () => {
        const registry = createProtocolCodecRegistry([codec(1), codec(2), codec(3, true)]);

        expect(registry.advertisedCodec.protocolVersion).toBe(2);
        expect(registry.latestCodec.protocolVersion).toBe(3);
        expect(registry.codecForProtocol(3)?.preview).toBe(true);
        expect(registry.registeredCodecs.map((entry) => entry.protocolVersion)).toEqual([3, 2, 1]);
        expect(registry.supportedMinecraftVersions).toEqual(['1.0.1', '1.0.2', '1.0.3']);
    });

    it('advertises the newest codec when there is no preview', () => {
        const registry = createProtocolCodecRegistry([codec(2), codec(1)]);

        expect(registry.advertisedCodec).toBe(registry.latestCodec);
        expect(registry.advertisedCodec.protocolVersion).toBe(2);
    });

    it('refuses a registry with no release to advertise', () => {
        expect(() => createProtocolCodecRegistry([codec(3, true)])).toThrow(/release codec/);
    });

    it('refuses more than one preview', () => {
        expect(() => createProtocolCodecRegistry([codec(1), codec(2, true), codec(3, true)])).toThrow(
            /Only the newest preview/
        );
    });

    it('refuses a preview older than a release', () => {
        expect(() => createProtocolCodecRegistry([codec(1, true), codec(2)])).toThrow(/older than release 2/);
    });
});
