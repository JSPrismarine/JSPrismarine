import { homedir } from 'node:os';
import path from 'node:path';

import { isAddonName, isAddonRange, isAddonVersion } from '@jsprismarine/addon-tools/addonIndex';
import { PrismarineAddonErrors } from '@jsprismarine/errors/prismarine/addon';

import type { AddonRequest } from './addonFiles';
import { DEFAULT_ADDON_SOURCE, isAddonSource, isHttpsUrl } from './addonFiles';

/** What `addon install` was asked to install, and the local name it installs under unless `as` gives one. */
export interface AddonSpec {
    readonly request: AddonRequest;
    /** The source's range, when the spec named one; an install without one locks `^<version>`. */
    readonly range?: string;
    /** The key the addon installs under by default, or undefined when nothing names one. */
    readonly key?: string;
}

/**
 * The extensions of the content archives a Bedrock client imports, which the installer takes. The
 * last, a Minecraft Editor project, it refuses with a reason.
 */
export const ADDON_ARCHIVE_EXTENSIONS = ['.mcpack', '.mcaddon', '.mcworld', '.mctemplate', '.mcproject'] as const;

const ARCHIVE_EXTENSION = new RegExp(
    `(?:${ADDON_ARCHIVE_EXTENSIONS.map((extension) => extension.replace('.', '\\.')).join('|')})$`,
    'i'
);

/**
 * Whether a file name is a content archive: an `.mcpack`, an `.mcaddon` of several packs and
 * worlds, an `.mcworld` or `.mctemplate`, or an `.mcproject`, which the installer refuses with a
 * reason rather than ignoring.
 */
export const isPackFile = (file: string): boolean => ARCHIVE_EXTENSION.test(file);

/** Whether an argument is a path rather than an addon name: it starts like one, or names a pack archive. */
const isPath = (spec: string): boolean =>
    /^(?:\.{1,2}[\\/]|[\\/]|~[\\/]|[A-Za-z]:[\\/])/.test(spec) || isPackFile(spec);

/**
 * The key a pack file's name gives: `tps-bar-1.0.0.mcpack` is `tps-bar`, the way the build names
 * packs, and `warps.mcaddon` is `warps`.
 */
const keyOfPackFile = (file: string): string | undefined => {
    const base = file.replace(ARCHIVE_EXTENSION, '');
    const match = /^(.+)-(\d+\.\d+\.\d+)$/.exec(base);
    const key = match && isAddonVersion(match[2]!) ? match[1]! : base;
    return isAddonName(key) ? key : undefined;
};

/**
 * The key a pack file dropped into `addons/` installs under. Its name rarely is a local name
 * already, so `Furniture_Pack v2.mcaddon` becomes `furniture-pack-v2`: lowercase, with each run
 * of other characters a hyphen.
 *
 * @returns The key, or undefined when the name has no letter or digit to make one from.
 */
export const keyOfDroppedPack = (file: string): string | undefined => {
    const exact = keyOfPackFile(file);
    if (exact !== undefined) return exact;
    const key = file
        .replace(ARCHIVE_EXTENSION, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return isAddonName(key) ? key : undefined;
};

/**
 * Reads what `addon install` takes:
 *
 * - `tps-bar` or `tps-bar@^1.0.0`: an addon from JSPrismarine's own source.
 * - `owner/repo/name[@range]`: an addon from another repository's `addons` release.
 * - `https://example.com/warps.mcpack`: a pack at a URL, with no index and no hash to check.
 * - `./my-addon`, `/srv/packs/warps.mcpack`, `./warps.mcaddon`: a folder or a pack on disk.
 *
 * @param spec - The argument as typed.
 * @param serverDirectory - The server's folder; a path is stored relative to it when it is inside.
 * @param cwd - What a relative path is relative to: the folder the server was started from.
 * @throws {PrismarineAddonErrors.InvalidAddonSpec} When it is none of those.
 */
export const parseAddonSpec = (spec: string, serverDirectory: string, cwd: string): AddonSpec => {
    const fail = (problem: string) => new PrismarineAddonErrors.InvalidAddonSpec({ spec, problem });
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(spec)) {
        if (!isHttpsUrl(spec)) throw fail('a URL must be https');
        return { request: { url: spec }, ...optionalKey(keyOfPackFile(path.posix.basename(new URL(spec).pathname))) };
    }
    if (isPath(spec)) {
        const absolute = path.resolve(cwd, spec.replace(/^~(?=[\\/])/, homedir()));
        const relative = path.relative(serverDirectory, absolute);
        // `..draft` is a folder inside; only a `..` segment leads out.
        const outside = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
        const stored = outside ? absolute : relative;
        const file = path.basename(absolute);
        const key = isPackFile(file) ? keyOfPackFile(file) : isAddonName(file) ? file : undefined;
        return { request: { path: stored === '' ? '.' : stored }, ...optionalKey(key) };
    }

    const at = spec.indexOf('@');
    const named = at === -1 ? spec : spec.slice(0, at);
    const range = at === -1 ? undefined : spec.slice(at + 1);
    if (range !== undefined && !isAddonRange(range))
        throw fail(`${range} is not a range such as ^1.0.0, ~1.0.0, 1.0.0 or *`);
    const parts = named.split('/');
    const name = parts.at(-1)!;
    if (!isAddonName(name)) throw fail(`${name} is not an addon name`);
    let source = DEFAULT_ADDON_SOURCE;
    if (parts.length === 3) {
        source = `${parts[0]}/${parts[1]}`;
        if (!isAddonSource(source)) throw fail(`${source} is not a GitHub repository, owner/repo`);
    } else if (parts.length !== 1) {
        throw fail('name an addon as <name> or <owner>/<repo>/<name>, or start a path with ./');
    }
    return {
        request: { source, name, version: range ?? '*' },
        ...(range === undefined ? {} : { range }),
        key: name
    };
};

const optionalKey = (key: string | undefined): { key?: string } => (key === undefined ? {} : { key });
