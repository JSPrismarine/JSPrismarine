import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveJavaRelease } from './release.ts';
import { packageDir } from './worldgen-cache.ts';

describe('resolveJavaRelease', () => {
    it('returns the release sources.json pins', async () => {
        // This package's own manifest, parsed JSON.
        const sources = JSON.parse(readFileSync(join(packageDir, 'sources.json'), 'utf8')) as {
            javaServer: { version: string; sha1: string };
        };

        const release = await resolveJavaRelease([]);

        expect(release).toMatchObject({
            name: 'java-server',
            version: sources.javaServer.version,
            hash: { algorithm: 'sha1', value: sources.javaServer.sha1 }
        });
    });
});
