import { describe, expect, it } from 'vitest';

import { JAVA_RELEASES, NEWEST_JAVA_RELEASE } from './javaReleases';

describe('JAVA_RELEASES', () => {
    it('lists the newest release first', () => {
        expect(JAVA_RELEASES[0]).toBe(NEWEST_JAVA_RELEASE);
        const numbers = JAVA_RELEASES.map((release) => release.protocolVersion);
        expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
    });
});
