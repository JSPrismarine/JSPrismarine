import { JAVA_RELEASES, NEWEST_JAVA_RELEASE } from '@jsprismarine/protocol/java/versions/javaReleases';
import { describe, expect, it } from 'vitest';

import { advertisedCodec, registeredCodecs } from './network/codec/CodecRegistry';
import type { ProtocolProvider } from './protocolProviders';
import {
    BUILT_IN_PROTOCOL_PROVIDERS,
    bedrockProtocolProvider,
    describeProtocolProviders,
    javaProtocolProvider
} from './protocolProviders';

describe('bedrockProtocolProvider', () => {
    it('lists exactly the protocols the server has a codec for, newest first, as the codecs mark them', () => {
        expect(bedrockProtocolProvider.protocols()).toEqual(
            registeredCodecs.map((codec) => ({
                protocolVersion: codec.protocolVersion,
                minecraftVersions: codec.minecraftVersions,
                advertised: codec === advertisedCodec,
                preview: codec.preview === true
            }))
        );
    });
});

describe('javaProtocolProvider', () => {
    it('lists every Java release, advertising the newest', () => {
        const protocols = javaProtocolProvider.protocols();

        expect(protocols.map(({ protocolVersion }) => protocolVersion)).toEqual(
            JAVA_RELEASES.map(({ protocolVersion }) => protocolVersion)
        );
        expect(protocols.filter(({ advertised }) => advertised)).toEqual([
            {
                protocolVersion: NEWEST_JAVA_RELEASE.protocolVersion,
                minecraftVersions: [NEWEST_JAVA_RELEASE.minecraftVersion],
                advertised: true,
                preview: false
            }
        ]);
    });
});

describe('describeProtocolProviders', () => {
    /** An edition an embedder brings, with a release, a preview and an older release. */
    const custom: ProtocolProvider = {
        edition: 'Pocket Edition',
        protocols: () => [
            { protocolVersion: 9, minecraftVersions: ['9.1-beta'], advertised: false, preview: true },
            { protocolVersion: 8, minecraftVersions: ['8.0', '8.1'], advertised: true, preview: false },
            { protocolVersion: 7, minecraftVersions: ['7.0'], advertised: false, preview: false }
        ]
    };

    it('describes any edition the same way: its name, then each protocol newest first with what it is', () => {
        expect(describeProtocolProviders([custom])).toEqual([
            'Pocket Edition: 9.1-beta (protocol 9, preview), 8.0, 8.1 (protocol 8, advertised), 7.0 (protocol 7)'
        ]);
    });

    it('highlights every release and number for the log and chat, and describes each built-in edition', () => {
        const [bedrock, java] = describeProtocolProviders(BUILT_IN_PROTOCOL_PROVIDERS, true);

        expect(bedrock).toMatch(/^Bedrock Edition: /);
        expect(bedrock).toContain(`protocol §e${advertisedCodec.protocolVersion}§r, advertised`);
        expect(java).toBe(
            `Java Edition: §e${NEWEST_JAVA_RELEASE.minecraftVersion}§r (protocol §e${NEWEST_JAVA_RELEASE.protocolVersion}§r, advertised)`
        );
    });
});
