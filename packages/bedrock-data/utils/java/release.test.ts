import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveJavaBedrockPair, resolveJavaRelease } from './release.ts';
import { packageDir } from './worldgen-cache.ts';

// This package's own manifest, parsed JSON.
const sources = JSON.parse(readFileSync(join(packageDir, 'sources.json'), 'utf8')) as {
    bds: { defaultProtocolVersion: number };
    javaServer: { defaultVersion: string; versions: Record<string, { sha1: string }> };
};

describe('resolveJavaRelease', () => {
    it('returns the default release when no --java is given', async () => {
        const release = await resolveJavaRelease([]);
        const { defaultVersion } = sources.javaServer;

        expect(release).toMatchObject({
            name: 'java-server',
            version: defaultVersion,
            hash: { algorithm: 'sha1', value: sources.javaServer.versions[defaultVersion]?.sha1 }
        });
    });

    it('returns the release --java names', async () => {
        const { defaultVersion } = sources.javaServer;
        await expect(resolveJavaRelease(['node', 'x.ts', '--java', defaultVersion])).resolves.toMatchObject({
            version: defaultVersion
        });
    });

    it('rejects a --java without a release, and a release that is not pinned', async () => {
        await expect(resolveJavaRelease(['node', 'x.ts', '--java'])).rejects.toThrow(/--java needs/);
        await expect(resolveJavaRelease(['node', 'x.ts', '--java', '0.0'])).rejects.toThrow(/pins no Java/);
    });
});

describe('resolveJavaBedrockPair', () => {
    it('pairs the default release with the default protocol when no --java is given', () => {
        expect(resolveJavaBedrockPair([])).toEqual({
            java: sources.javaServer.defaultVersion,
            protocol: sources.bds.defaultProtocolVersion
        });
    });

    it('rejects a release that is not pinned', () => {
        expect(() => resolveJavaBedrockPair(['node', 'x.ts', '--java', '0.0'])).toThrow(
            /pins no Java Edition release 0\.0/
        );
    });
});
