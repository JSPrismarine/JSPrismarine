import { describe, expect, it } from 'vitest';

import {
    buildName,
    parseManifest,
    parseTransport,
    pinMatrix,
    readManifest,
    resolvePin,
    runName,
    servedProtocols
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

    it('lists a run for every declared transport of every served protocol', () => {
        const matrix = pinMatrix();
        const { versions } = readManifest();

        for (const protocol of servedProtocols()) {
            const version = versions.find((candidate) => candidate.protocol === protocol);
            expect(matrix.filter((entry) => entry.protocol === protocol).map((entry) => entry.transport)).toEqual(
                version?.transports
            );
        }
        expect(new Set(matrix.map((entry) => entry.name)).size).toBe(matrix.length);
        for (const entry of matrix) expect(entry.build).toBe(buildName(entry.commit));
    });

    it('gives every run of one commit the same build', () => {
        const builds = pinMatrix(false, manifest).filter((entry) => entry.commit === newer);

        expect(new Set(builds.map((entry) => entry.build))).toEqual(new Set([buildName(newer)]));
    });

    it('keeps only the newest protocol for a latest-only run', () => {
        const newest = servedProtocols().at(-1);

        expect(pinMatrix(true).every((entry) => entry.protocol === newest)).toBe(true);
    });
});
