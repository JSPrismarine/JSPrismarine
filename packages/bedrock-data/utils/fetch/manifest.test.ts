import { describe, expect, it } from 'vitest';

import { type BdsData, type JavaServerData, type JavaVersion, validateJavaServerData } from './manifest.ts';

const jar = (extra: Partial<JavaVersion> = {}): JavaVersion => ({
    url: 'https://example.invalid/server.jar',
    sha1: '0'.repeat(40),
    sha256: '0'.repeat(64),
    sizeInBytes: 1,
    ...extra
});

const bds: BdsData = {
    defaultProtocolVersion: 2225,
    versions: {
        '2225': {
            url: 'https://example.invalid/bds.zip',
            sha256: '0'.repeat(64),
            sha1: '0'.repeat(40),
            sizeInBytes: 1,
            minecraftVersion: '1.26.50',
            serverVersion: '1.26.50.1'
        }
    }
};

describe('validateJavaServerData', () => {
    it('accepts a default, a preview and a release that declares its Bedrock protocol', () => {
        const data: JavaServerData = {
            defaultVersion: '26.3',
            versions: {
                '26.3': jar(),
                '26.4': jar({ bedrockProtocol: 2225 }),
                '26.5-snapshot-1': jar({ preview: true })
            }
        };
        expect(() => validateJavaServerData(data, bds)).not.toThrow();
    });

    it('refuses a release that is neither default nor preview without a Bedrock protocol', () => {
        const data: JavaServerData = { defaultVersion: '26.3', versions: { '26.2': jar(), '26.3': jar() } };
        expect(() => validateJavaServerData(data, bds)).toThrow(/26\.2 is neither the default nor the preview/);
    });

    it('refuses a Bedrock protocol the bds section does not pin', () => {
        const data: JavaServerData = {
            defaultVersion: '26.3',
            versions: { '26.2': jar({ bedrockProtocol: 1 }), '26.3': jar() }
        };
        expect(() => validateJavaServerData(data, bds)).toThrow(/protocol 1, which the bds section does not pin/);
    });

    it('refuses a Bedrock protocol on the default, whose pair is derived', () => {
        const data: JavaServerData = { defaultVersion: '26.3', versions: { '26.3': jar({ bedrockProtocol: 2225 }) } };
        expect(() => validateJavaServerData(data, bds)).toThrow(/sets bedrockProtocol/);
    });
});
