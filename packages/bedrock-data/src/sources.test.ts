import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import sources from '../sources.json' with { type: 'json' };
import type { PairedSources } from './sources';
import { javaBedrockPair, javaBedrockPairs, javaServerCacheFolder, readGeneratedJavaVersion } from './sources';

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jsp-java-version-'));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe('javaServerCacheFolder', () => {
    it('is the default Java release', () => {
        expect(javaServerCacheFolder).toBe(sources.javaServer.defaultVersion);
    });
});

describe('javaBedrockPairs', () => {
    type Sections = PairedSources['javaServer']['versions'];
    const pin = (preview?: boolean): Sections[string] => ({
        url: 'https://example.invalid/pin',
        ...(preview === undefined ? {} : { preview })
    });
    const release: PairedSources['javaServer'] = { defaultVersion: '26.3', versions: { '26.3': pin() } };
    const withJavaPreview: PairedSources['javaServer'] = {
        defaultVersion: '26.3',
        versions: { '26.3': pin(), '26.4-snapshot-8': pin(true) }
    };
    const bds: PairedSources['bds'] = { defaultProtocolVersion: 2225, versions: { '2225': pin() } };
    const withBedrockPreview: PairedSources['bds'] = {
        defaultProtocolVersion: 2225,
        versions: { '2225': pin(), '2259': pin(true) }
    };

    it('pairs the defaults when nothing is a preview', () => {
        expect(javaBedrockPairs({ bds, javaServer: release })).toEqual([{ java: '26.3', protocol: 2225 }]);
    });

    it('ignores a Bedrock preview with no Java preview', () => {
        expect(javaBedrockPairs({ bds: withBedrockPreview, javaServer: release })).toEqual([
            { java: '26.3', protocol: 2225 }
        ]);
    });

    it('pairs a Java preview with the default protocol when Bedrock has no preview', () => {
        expect(javaBedrockPairs({ bds, javaServer: withJavaPreview })).toEqual([
            { java: '26.3', protocol: 2225 },
            { java: '26.4-snapshot-8', protocol: 2225 }
        ]);
    });

    it('pairs a release that is neither default nor preview with its declared protocol', () => {
        const withRetained: PairedSources['javaServer'] = {
            defaultVersion: '26.3',
            versions: { '26.2': { ...pin(), bedrockProtocol: 2193 }, '26.3': pin(), '26.4-snapshot-8': pin(true) }
        };
        expect(javaBedrockPairs({ bds, javaServer: withRetained })).toEqual([
            { java: '26.3', protocol: 2225 },
            { java: '26.4-snapshot-8', protocol: 2225 },
            { java: '26.2', protocol: 2193 }
        ]);
    });

    it('pairs the two previews', () => {
        expect(javaBedrockPairs({ bds: withBedrockPreview, javaServer: withJavaPreview })).toEqual([
            { java: '26.3', protocol: 2225 },
            { java: '26.4-snapshot-8', protocol: 2259 }
        ]);
    });
});

describe('javaBedrockPair', () => {
    it('pairs the default Java release with the default protocol', () => {
        expect(javaBedrockPair()).toEqual({
            java: sources.javaServer.defaultVersion,
            protocol: sources.bds.defaultProtocolVersion
        });
    });

    it('has no pair for a release sources.json does not pin', () => {
        expect(javaBedrockPair('1.21')).toBeUndefined();
    });
});

describe('readGeneratedJavaVersion', () => {
    it('reads the record datagen:java writes', async () => {
        const record = { release: '26.3', javaVersion: 25, dataPackFormat: [101, 1], dataVersion: 4790 };
        await writeFile(join(dir, 'version.json'), JSON.stringify(record));

        expect(readGeneratedJavaVersion(dir)).toEqual(record);
    });

    it('returns undefined for a datapack generated before the record existed', () => {
        expect(readGeneratedJavaVersion(dir)).toBeUndefined();
    });

    it.each([
        ['not JSON', '{'],
        [
            'a format without a minor',
            JSON.stringify({ release: '26.3', javaVersion: 25, dataPackFormat: [101], dataVersion: 1 })
        ],
        ['a missing data version', JSON.stringify({ release: '26.3', javaVersion: 25, dataPackFormat: [101, 1] })]
    ])('returns undefined for %s', async (_case, content) => {
        await writeFile(join(dir, 'version.json'), content);

        expect(readGeneratedJavaVersion(dir)).toBeUndefined();
    });
});
