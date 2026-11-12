import os from 'node:os';
import path from 'node:path';

/**
 * The per-user cache directory, which outlives any one working directory.
 *
 * `%LOCALAPPDATA%` on Windows, `~/Library/Caches` on macOS and `$XDG_CACHE_HOME` (or
 * `~/.cache`) elsewhere, the places each platform's own tools keep re-downloadable data.
 * The path syntax follows `platform`, not the host, so the docs can print every platform's path.
 *
 * @param env - The environment to read `LOCALAPPDATA` and `XDG_CACHE_HOME` from.
 * @param platform - The operating system to answer for.
 * @param home - The user's home directory.
 */
export const userCacheDir = (
    env: NodeJS.ProcessEnv = process.env,
    platform: NodeJS.Platform = process.platform,
    home: string = os.homedir()
): string => {
    if (platform === 'win32') {
        return path.win32.join(env.LOCALAPPDATA || path.win32.join(home, 'AppData', 'Local'), 'JSPrismarine', 'Cache');
    }
    if (platform === 'darwin') return path.posix.join(home, 'Library', 'Caches', 'JSPrismarine');
    return path.posix.join(env.XDG_CACHE_HOME || path.posix.join(home, '.cache'), 'jsprismarine');
};
