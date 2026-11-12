import { describe, expect, it } from 'vitest';

import { userCacheDir } from './userCache';

describe('userCacheDir', () => {
    it('follows XDG_CACHE_HOME on Linux, falling back to ~/.cache', () => {
        expect(userCacheDir({ XDG_CACHE_HOME: '/xdg' }, 'linux', '/home/u')).toBe('/xdg/jsprismarine');
        expect(userCacheDir({}, 'linux', '/home/u')).toBe('/home/u/.cache/jsprismarine');
    });

    it('uses ~/Library/Caches on macOS', () => {
        expect(userCacheDir({ XDG_CACHE_HOME: '/xdg' }, 'darwin', '/Users/u')).toBe(
            '/Users/u/Library/Caches/JSPrismarine'
        );
    });

    it('uses LOCALAPPDATA on Windows, falling back to the profile', () => {
        expect(userCacheDir({ LOCALAPPDATA: 'C:\\Local' }, 'win32', 'C:\\Users\\u')).toBe(
            'C:\\Local\\JSPrismarine\\Cache'
        );
        expect(userCacheDir({}, 'win32', 'C:\\Users\\u')).toBe('C:\\Users\\u\\AppData\\Local\\JSPrismarine\\Cache');
    });
});
