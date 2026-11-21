import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { JAVA_RELEASES, NEWEST_JAVA_RELEASE } from './javaReleases';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

/** The `version.json` of a release's cached server jar, or undefined when the cache lacks it. */
const jarVersion = (release: string): { id: string; protocol_version: number } | undefined => {
    const jar = path.join(repoRoot, 'node_modules/.cache/jsprismarine/java', release, 'server.jar');
    if (!existsSync(jar)) return undefined;
    // Extracted game data: parsed, never executed.
    return JSON.parse(execFileSync('unzip', ['-p', jar, 'version.json'], { encoding: 'utf8' }));
};

describe('JAVA_RELEASES', () => {
    it('lists the newest release first', () => {
        expect(JAVA_RELEASES[0]).toBe(NEWEST_JAVA_RELEASE);
        const numbers = JAVA_RELEASES.map((release) => release.protocolVersion);
        expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
    });

    it.each(JAVA_RELEASES)('gives $minecraftVersion the protocol number its server jar declares', (release) => {
        const declared = jarVersion(release.minecraftVersion);
        if (declared === undefined) return;

        expect(declared).toMatchObject({ id: release.minecraftVersion, protocol_version: release.protocolVersion });
    });
});
