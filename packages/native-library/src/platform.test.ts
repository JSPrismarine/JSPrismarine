import { describe, expect, it } from 'vitest';

import { operatingSystemOf, platformKey } from './platform';

describe('operatingSystemOf', () => {
    it.each(['darwin', 'win32', 'android', 'freebsd', 'openbsd', 'sunos'] as const)(
        'gives back the operating system platformKey was made for on %s',
        (platform) => {
            expect(operatingSystemOf(platformKey(platform, 'x64'))).toBe(platform);
        }
    );

    it('reads a Linux key, which names its C library too', () => {
        expect(operatingSystemOf(platformKey('linux', 'arm64', 'musl'))).toBe('linux');
    });
});
