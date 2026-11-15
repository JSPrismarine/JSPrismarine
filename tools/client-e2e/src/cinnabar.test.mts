import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import {
    buildName,
    compiledAssetsPresent,
    parseManifest,
    parseTransport,
    pinMatrix,
    readManifest,
    recordCompiledAssets,
    resolvePin,
    runName,
    servedProtocols,
    testedProtocols
} from './cinnabar.mts';

const older = '485c24673e9df7ba31a6788e24797cbc4a18c2a5';
const newer = 'ae1c2073fc3bda1be7ce4a014acc080c6e31ecd5';
const manifest = parseManifest(
    {
        repository: 'https://example.test/cinnabar.git',
        versions: {
            '2193': { commit: older, transports: ['raknet'] },
            '2225': { commit: newer, transports: ['raknet', 'nethernet'] },
            '2300': { commit: newer, transports: ['nethernet'] }
        }
    },
    'cinnabar.json'
);

describe('cinnabar pins', () => {
    it('names a run by its protocol and transport, and a build by its commit', () => {
        expect(runName({ protocol: 2225, transport: 'raknet' })).toBe('v2225');
        expect(runName({ protocol: 2225, transport: 'nethernet' })).toBe('v2225-nethernet');
        expect(buildName(newer)).toBe('ae1c2073fc3b');
    });

    it('refuses an unknown transport', () => {
        expect(parseTransport('nethernet')).toBe('nethernet');
        expect(() => parseTransport('udp')).toThrow('--transport must be raknet or nethernet, not udp');
    });

    it('runs a protocol over the first transport it lists unless asked for another', () => {
        expect(resolvePin(manifest, 2225, undefined)).toMatchObject({ transport: 'raknet', commit: newer });
        expect(resolvePin(manifest, 2225, 'nethernet')).toMatchObject({ transport: 'nethernet', commit: newer });
        expect(resolvePin(manifest, 2300, undefined)).toMatchObject({ transport: 'nethernet' });
    });

    it('refuses a transport the version does not declare and says which ones it has', () => {
        expect(() => resolvePin(manifest, 2193, 'nethernet')).toThrow(
            'protocol 2193 runs over raknet only; cinnabar.json lists no nethernet transport for it'
        );
        expect(() => resolvePin(manifest, 2300, 'raknet')).toThrow('protocol 2300 runs over nethernet only');
        expect(() => resolvePin(manifest, 1, undefined)).toThrow('has no cinnabar pin for wire protocol 1');
    });

    it.each([
        [{ commit: older }, 'must list the transports'],
        [{ commit: older, transports: [] }, 'must list the transports'],
        [{ commit: older, transports: ['raknet', 'raknet'] }, 'must list the transports'],
        [{ commit: older, transports: ['udp'] }, 'must list the transports'],
        [{ commit: older.slice(0, 12), transports: ['raknet'] }, 'needs a full 40-character cinnabar commit']
    ])('refuses the version entry %j', (entry, message) => {
        expect(() => parseManifest({ repository: 'r', versions: { '2193': entry } }, 'cinnabar.json')).toThrow(message);
    });

    it('lists a run for every declared transport of every tested protocol', () => {
        const matrix = pinMatrix();
        const { versions } = readManifest();

        for (const protocol of testedProtocols()) {
            const version = versions.find((candidate) => candidate.protocol === protocol);
            expect(matrix.filter((entry) => entry.protocol === protocol).map((entry) => entry.transport)).toEqual(
                version?.transports
            );
        }
        expect(new Set(matrix.map((entry) => entry.name)).size).toBe(matrix.length);
        for (const entry of matrix) expect(entry.build).toBe(buildName(entry.commit));
    });

    it('leaves preview protocols out of the cinnabar runs', () => {
        // Read the flags straight from the pins, so a testedProtocols() that kept previews fails here.
        const sources = new URL('../../../packages/bedrock-data/sources.json', import.meta.url);
        // Parsed JSON is an untyped boundary; only `bds.versions[*].preview` is read.
        const pins: Record<string, { preview?: boolean }> = JSON.parse(fs.readFileSync(sources, 'utf8')).bds.versions;
        const previews = Object.entries(pins)
            .filter(([, pin]) => pin.preview === true)
            .map(([protocol]) => Number(protocol));

        expect(previews.length).toBeGreaterThan(0);
        expect(servedProtocols()).toEqual(expect.arrayContaining(previews));
        expect(testedProtocols().filter((protocol) => previews.includes(protocol))).toEqual([]);
        expect(pinMatrix().filter((entry) => previews.includes(entry.protocol))).toEqual([]);
    });

    it('gives every run of one commit the same build', () => {
        const builds = pinMatrix(false, manifest).filter((entry) => entry.commit === newer);

        expect(new Set(builds.map((entry) => entry.build))).toEqual(new Set([buildName(newer)]));
    });

    it('keeps only the newest protocol for a latest-only run', () => {
        const newest = testedProtocols().at(-1);

        expect(pinMatrix(true).every((entry) => entry.protocol === newest)).toBe(true);
    });
});

describe('compiled assets', () => {
    const build = () => {
        const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'cinnabar-build-'));
        onTestFinished(() => fs.rmSync(cache, { recursive: true, force: true }));
        const checkout = path.join(cache, 'repo');
        const compiled = path.join(checkout, '.local', 'assets', 'compiled');
        fs.mkdirSync(path.join(compiled, 'lang'), { recursive: true });
        fs.writeFileSync(path.join(compiled, 'vanilla-v1.mcbeatm'), '');
        fs.writeFileSync(path.join(compiled, 'prepared.json'), '{}');
        return { cache, checkout, compiled };
    };

    it('counts the assets present while every recorded one is in the checkout', () => {
        const { cache, checkout } = build();
        recordCompiledAssets(checkout, cache);
        expect(compiledAssetsPresent(checkout, cache)).toBe(true);
    });

    it('sees the compiled asset directory deleted after the build was stamped', () => {
        const { cache, checkout, compiled } = build();
        recordCompiledAssets(checkout, cache);
        fs.rmSync(compiled, { recursive: true });
        expect(compiledAssetsPresent(checkout, cache)).toBe(false);
    });

    it('sees one recorded asset missing', () => {
        const { cache, checkout, compiled } = build();
        recordCompiledAssets(checkout, cache);
        fs.rmSync(path.join(compiled, 'vanilla-v1.mcbeatm'));
        expect(compiledAssetsPresent(checkout, cache)).toBe(false);
    });

    it('does not trust a build that recorded no assets', () => {
        const { cache, checkout } = build();
        expect(compiledAssetsPresent(checkout, cache)).toBe(false);
    });
});
