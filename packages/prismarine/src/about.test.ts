import { afterEach, describe, expect, it, vi } from 'vitest';

import { about } from './about';
import { latestCodec, registeredCodecs } from './network/codec/CodecRegistry';
import { serverVersion, softwareLabel } from './version';

describe('about', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('advertises the newest Minecraft release of the newest codec', () => {
        const { minecraftVersion, protocolVersion } = about();

        expect(protocolVersion).toBe(latestCodec.protocolVersion);
        expect(minecraftVersion).toBe(latestCodec.minecraftVersions.at(-1));
    });

    it('lists every registered protocol and marks only the advertised one', () => {
        const { protocols, protocolVersion } = about();

        expect(protocols.map((protocol) => protocol.protocolVersion)).toStrictEqual(
            registeredCodecs.map((codec) => codec.protocolVersion)
        );
        expect(protocols.filter((protocol) => protocol.advertised).map((p) => p.protocolVersion)).toStrictEqual([
            protocolVersion
        ]);
    });

    it('reports the stamped build version everywhere it names the software', () => {
        vi.stubGlobal('BUILD_VERSION', '0.16.0-nightly.20261031.1');

        expect(about().version).toBe('0.16.0-nightly.20261031.1');
        expect(serverVersion()).toBe('0.16.0-nightly.20261031.1');
        expect(softwareLabel()).toBe('JSPrismarine v0.16.0-nightly.20261031.1');
        expect(softwareLabel(true)).toBe('JSPrismarine §ev0.16.0-nightly.20261031.1§r');
    });
});
