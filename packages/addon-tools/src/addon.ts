import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { AddonToolsErrors } from '@jsprismarine/errors/addon-tools';
import { isJSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';
import { parseLenientJson } from '@jsprismarine/packs/lenientJson';
import { parseManifest } from '@jsprismarine/packs/manifest';
import { writeZip } from '@jsprismarine/packs/zip';

import type { AddonIndexEntry, AddonListing } from './addonIndex';
import { isAddonInstallId, isAddonName, isAddonVersion, packFileName } from './addonIndex';
import { ADDON_SOURCE_ENTRIES, ADDON_SOURCE_MAP_EXTENSION, isTypeScriptAddon } from './compile';
import { isRecord } from './isRecord';
import { fileUrl } from './url';

/**
 * An addon is a behavior pack in a folder named for the addon: `manifest.json`, `scripts/` and a
 * `README.md`, plus an `addon.json` with what the index and the server's installer need beside the
 * manifest. The manifest header's version is the addon's version.
 */

/** The files every addon folder has. */
export const ADDON_FILES = ['manifest.json', 'addon.json', 'README.md'] as const;

/** The manifest module types an addon may declare: a behavior pack's. */
export const ADDON_MODULE_TYPES: readonly string[] = ['data', 'script'];

/**
 * The tags an addon may list in `addon.json`, which the marketplace filters by. The list is fixed
 * so that each filter collects every addon it should.
 */
export const ADDON_TAGS = ['admin', 'chat', 'gameplay', 'performance', 'world'] as const;

/** One of {@link ADDON_TAGS}. */
export type AddonTag = (typeof ADDON_TAGS)[number];

/** The folder of an addon that holds its screenshots. The pack leaves it out. */
export const ADDON_MEDIA_DIRECTORY = 'media';

/** The pack's icon, which Bedrock shows and the marketplace uses as the addon's icon. */
export const ADDON_ICON_FILE = 'pack_icon.png';

/** The file types a screenshot may have. */
export const ADDON_SCREENSHOT_TYPES: readonly string[] = ['.png', '.jpg', '.jpeg', '.webp'];

/** A screenshot `addon.json` lists. */
export interface AddonScreenshot {
    /** The image's path in the addon's folder, under {@link ADDON_MEDIA_DIRECTORY}. */
    readonly file: string;
    /** What the image shows, for a reader who cannot see it. */
    readonly alt: string;
}

/** What `addon.json` holds. */
export interface AddonMetadata {
    /** A one-line description of what the addon does. */
    readonly description: string;
    /** The oldest JSPrismarine version the addon runs on, `major.minor.patch`. */
    readonly minServer: string;
    /** The addon's license, as an SPDX expression such as `MIT`. */
    readonly license: string;
    /** The addon's name for people. Defaults to the README's first heading, then the manifest header's name. */
    readonly title?: string;
    /** Tags from {@link ADDON_TAGS}, for the marketplace's filters. */
    readonly tags?: readonly AddonTag[];
    /** Who wrote the addon. */
    readonly authors?: readonly string[];
    /** Screenshots for the addon's page, in the order the page shows them. */
    readonly screenshots?: readonly AddonScreenshot[];
    /** Why the addon should no longer be installed; servers warn with it. */
    readonly deprecated?: string;
    /** The install id of the addon that replaces this one, such as `warps-plus` or `owner/repo/name`. */
    readonly replacedBy?: string;
}

/** The keys every `addon.json` has. */
export const ADDON_JSON_REQUIRED_KEYS = [
    'description',
    'minServer',
    'license'
] as const satisfies readonly (keyof AddonMetadata)[];

/** The keys an `addon.json` may add for its listing and deprecation. */
export const ADDON_JSON_OPTIONAL_KEYS = [
    'title',
    'tags',
    'authors',
    'screenshots',
    'deprecated',
    'replacedBy'
] as const satisfies readonly (keyof AddonMetadata)[];

/** An addon read from its folder and checked. */
export interface Addon extends AddonMetadata {
    /** The folder's name. */
    readonly name: string;
    /** The manifest header's version, `major.minor.patch`. */
    readonly version: string;
    /** The addon's name for people: `addon.json`'s `title`, the README's first heading or the manifest header's name. */
    readonly title: string;
    /**
     * Every file the pack holds, by its path in the folder with `/` separators, in path order:
     * every file but those under {@link ADDON_MEDIA_DIRECTORY}, and for a TypeScript addon those
     * that build its scripts.
     */
    readonly files: ReadonlyMap<string, Uint8Array>;
    /** The files under {@link ADDON_MEDIA_DIRECTORY}, by path, in path order. */
    readonly media: ReadonlyMap<string, Uint8Array>;
}

/** A file an addon's release attaches. */
export interface AddonReleaseFile {
    /** The file's name on the release. */
    readonly fileName: string;
    readonly bytes: Uint8Array;
    /** The file's SHA-256, in lowercase hexadecimal. */
    readonly sha256: string;
}

/** An addon's `.mcpack`, named `<name>-<version>.mcpack`. */
export type AddonPack = AddonReleaseFile;

/** The files a release attaches beside an addon's pack for its listing. */
export interface AddonListingFiles {
    /** The README, `<name>-<version>.md`. */
    readonly readme: AddonReleaseFile;
    /** The pack's icon, `<name>-<version>.png`, when it has one. */
    readonly icon?: AddonReleaseFile;
    /** Each screenshot, `<name>-<version>-<n>` and its type, numbered from 1, with its path in the folder. */
    readonly screenshots: readonly (AddonReleaseFile & { readonly alt: string; readonly file: string })[];
}

const METADATA_KEYS: readonly string[] = [...ADDON_JSON_REQUIRED_KEYS, ...ADDON_JSON_OPTIONAL_KEYS];

const sha256Of = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/**
 * Reads every file under a folder, skipping names that start with a dot. For a TypeScript addon it
 * also skips the {@link ADDON_SOURCE_ENTRIES} and the source maps, which build the pack's scripts
 * but are not part of the pack.
 * @throws {InvalidAddonError} `UnsupportedAddonEntry` for a link or another special entry.
 */
const readFiles = async (addon: string, root: string): Promise<Map<string, Uint8Array>> => {
    const typescript = isTypeScriptAddon(root);
    const paths: string[] = [];
    const walk = async (relative: string): Promise<void> => {
        for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
            if (entry.name.startsWith('.')) continue;
            if (typescript && relative === '' && ADDON_SOURCE_ENTRIES.includes(entry.name)) continue;
            if (typescript && entry.isFile() && entry.name.endsWith(ADDON_SOURCE_MAP_EXTENSION)) continue;
            const child = relative === '' ? entry.name : `${relative}/${entry.name}`;
            if (entry.isDirectory()) await walk(child);
            else if (entry.isFile()) paths.push(child);
            else throw new AddonToolsErrors.UnsupportedAddonEntry({ addon, path: child });
        }
    };
    await walk('');
    paths.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    const files = new Map<string, Uint8Array>();
    for (const file of paths) files.set(file, new Uint8Array(await readFile(path.join(root, file))));
    return files;
};

/**
 * Reads and checks an addon's `addon.json`: a `description` on one line, a `minServer` version
 * and a `license`, each a non-empty string, the optional {@link ADDON_JSON_OPTIONAL_KEYS} in the
 * shapes {@link AddonMetadata} gives, and no other keys.
 *
 * @param addon - The addon's name, for the error message.
 * @param bytes - The file's contents.
 * @throws {InvalidAddonError} `InvalidAddonJson` when the file breaks any of those rules.
 */
export const parseAddonMetadata = (addon: string, bytes: Uint8Array): AddonMetadata => {
    const fail = (problem: string) => new AddonToolsErrors.InvalidAddonJson({ addon, problem });
    let value: unknown;
    try {
        value = JSON.parse(new TextDecoder().decode(bytes));
    } catch (cause) {
        throw new AddonToolsErrors.InvalidAddonJson({ addon, problem: 'it is not JSON' }, { cause });
    }
    if (!isRecord(value)) throw fail('it is not a JSON object');

    const unknown = Object.keys(value).filter((key) => !METADATA_KEYS.includes(key));
    if (unknown.length > 0) throw fail(`it has keys the schema does not, ${unknown.join(', ')}`);
    const text = (key: keyof AddonMetadata): string => {
        const field = value[key];
        if (typeof field !== 'string' || field.trim().length === 0) throw fail(`${key} must be a non-empty string`);
        return field;
    };

    const line = (key: keyof AddonMetadata): string => {
        const field = text(key);
        if (/[\r\n]/.test(field)) throw fail(`${key} must be one line`);
        return field;
    };
    const optionalLine = (key: 'title' | 'deprecated' | 'replacedBy'): string | undefined =>
        value[key] === undefined ? undefined : line(key);
    const list = (key: 'tags' | 'authors' | 'screenshots'): unknown[] | undefined => {
        const field = value[key];
        if (field === undefined) return undefined;
        if (!Array.isArray(field)) throw fail(`${key} must be an array`);
        return field;
    };

    const description = line('description');
    const minServer = text('minServer');
    if (!isAddonVersion(minServer)) throw fail(`minServer must be a major.minor.patch version, got ${minServer}`);
    const metadata: AddonMetadata = { description, minServer, license: text('license') };

    const title = optionalLine('title');
    const deprecated = optionalLine('deprecated');
    const replacedBy = optionalLine('replacedBy');
    if (replacedBy !== undefined && !isAddonInstallId(replacedBy))
        throw fail(`replacedBy must be an install id such as warps or owner/repo/warps, got ${replacedBy}`);

    const tagList = list('tags');
    const tags = tagList?.map((tag): AddonTag => {
        const known = ADDON_TAGS.find((name) => name === tag);
        if (known === undefined) throw fail(`tags may hold only ${ADDON_TAGS.join(', ')}, got ${JSON.stringify(tag)}`);
        return known;
    });
    if (tags && new Set(tags).size !== tags.length) throw fail('tags lists a tag twice');

    const authors = list('authors')?.map((author) => {
        if (typeof author !== 'string' || author.trim().length === 0 || /[\r\n]/.test(author))
            throw fail('authors must hold non-empty one-line strings');
        return author;
    });

    const screenshots = list('screenshots')?.map((shot, i): AddonScreenshot => {
        const where = `screenshots[${i}]`;
        if (!isRecord(shot)) throw fail(`${where} must be an object with a file and an alt`);
        const unknownKeys = Object.keys(shot).filter((key) => key !== 'file' && key !== 'alt');
        if (unknownKeys.length > 0) throw fail(`${where} has keys the schema does not, ${unknownKeys.join(', ')}`);
        const { file, alt } = shot;
        if (typeof file !== 'string' || !file.startsWith(`${ADDON_MEDIA_DIRECTORY}/`))
            throw fail(`${where}.file must be a path under ${ADDON_MEDIA_DIRECTORY}/`);
        if (!ADDON_SCREENSHOT_TYPES.includes(path.posix.extname(file).toLowerCase()))
            throw fail(`${where}.file must end in ${ADDON_SCREENSHOT_TYPES.join(', ')}`);
        if (typeof alt !== 'string' || alt.trim().length === 0 || /[\r\n]/.test(alt))
            throw fail(`${where}.alt must be a non-empty string on one line`);
        return { file, alt };
    });

    return {
        ...metadata,
        ...(title === undefined ? {} : { title }),
        ...(tags === undefined ? {} : { tags }),
        ...(authors === undefined ? {} : { authors }),
        ...(screenshots === undefined ? {} : { screenshots }),
        ...(deprecated === undefined ? {} : { deprecated }),
        ...(replacedBy === undefined ? {} : { replacedBy })
    };
};

/** The text of a README's first `#` heading outside front matter and code fences, if it has one. */
const readmeTitle = (readme: string): string | undefined => {
    const lines = readme.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').split(/\r?\n/);
    let fence: string | undefined;
    for (const line of lines) {
        const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
        if (fence === undefined) {
            if (marker) {
                fence = marker[1];
                continue;
            }
            // Up to three spaces may indent a heading, as CommonMark reads one.
            const heading = /^ {0,3}#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(line)?.[1];
            if (heading) return heading;
            continue;
        }
        // A fence closes on a run of its own character at least as long, with nothing after it.
        const [run = '', rest = ''] = marker?.slice(1) ?? [];
        if (run[0] === fence[0] && run.length >= fence.length && rest.trim() === '') fence = undefined;
    }
    return undefined;
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Checks a pack icon is a square PNG, from its signature and the width and height in its header.
 * @throws {InvalidAddonError} `InvalidAddonIcon` when it is not.
 */
const checkIcon = (addon: string, bytes: Uint8Array): void => {
    const fail = (problem: string) => new AddonToolsErrors.InvalidAddonIcon({ addon, problem });
    if (bytes.length < 24 || PNG_SIGNATURE.some((byte, i) => bytes[i] !== byte)) throw fail('it is not a PNG');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (width === 0 || width !== height) throw fail(`it is ${width} by ${height} pixels, not square`);
};

/** The manifest's header version and name, after checking it is a behavior pack whose modules agree. */
const checkManifest = (
    addon: string,
    files: ReadonlyMap<string, Uint8Array>
): { readonly version: string; readonly name: string } => {
    const fail = (problem: string) => new AddonToolsErrors.InvalidAddonManifest({ addon, problem });
    let value: unknown;
    try {
        value = parseLenientJson(new TextDecoder().decode(files.get('manifest.json')));
    } catch (cause) {
        if (isJSPrismarineError(cause)) throw fail(cause.message);
        throw cause;
    }

    const { manifest, diagnostics } = parseManifest(value, addon);
    if (!manifest) throw fail(diagnostics.map((diagnostic) => diagnostic.message).join('; '));

    // parseManifest reads a bare number such as 1.2 as [1.2, 0, 0], which no index accepts.
    const version = manifest.header.version.join('.');
    if (!isAddonVersion(version))
        throw fail(`the header's version must be three whole numbers, such as [1, 2, 3], got ${version}`);
    for (const module of manifest.modules) {
        if (!ADDON_MODULE_TYPES.includes(module.type))
            throw new AddonToolsErrors.NotABehaviorPack({ addon, type: module.type });
        const moduleVersion = module.version.join('.');
        if (moduleVersion !== version)
            throw new AddonToolsErrors.ModuleVersionDiffers({ addon, type: module.type, moduleVersion, version });
    }

    // parseManifest keeps what every pack shares; a script module's entry is read here.
    const modules = isRecord(value) && Array.isArray(value.modules) ? value.modules : [];
    // The script host reads a script pack's manifest with JSON.parse, so comments and trailing
    // commas that the lenient reader takes would stop the pack from loading on a server.
    if (modules.some((module) => isRecord(module) && module.type === 'script')) {
        try {
            JSON.parse(new TextDecoder().decode(files.get('manifest.json')));
        } catch (cause) {
            throw fail(
                `a script pack's manifest must be plain JSON: ${cause instanceof Error ? cause.message : String(cause)}`
            );
        }
    }
    for (const module of modules) {
        if (!isRecord(module) || module.type !== 'script') continue;
        if (typeof module.entry !== 'string') throw fail('a script module needs an entry');
        if (!files.has(module.entry)) throw new AddonToolsErrors.MissingScriptEntry({ addon, entry: module.entry });
    }
    return { version, name: manifest.header.name };
};

/**
 * Reads an addon from its folder and checks it: the folder's name is an addon name, the three
 * {@link ADDON_FILES} are there, `manifest.json` is a behavior pack manifest whose modules carry
 * the header's version, each script module's entry exists, `addon.json` follows
 * {@link AddonMetadata} with no other keys, each screenshot it lists exists, and a
 * {@link ADDON_ICON_FILE} is a square PNG.
 *
 * @param directory - The addon's folder.
 * @throws {InvalidAddonError} When any check fails.
 */
export const readAddon = async (directory: string): Promise<Addon> => {
    const name = path.basename(path.resolve(directory));
    if (!isAddonName(name)) throw new AddonToolsErrors.InvalidAddonName({ name });

    const files = new Map<string, Uint8Array>();
    const media = new Map<string, Uint8Array>();
    for (const [file, bytes] of await readFiles(name, directory))
        (file.startsWith(`${ADDON_MEDIA_DIRECTORY}/`) ? media : files).set(file, bytes);
    for (const file of ADDON_FILES) {
        if (!files.has(file)) throw new AddonToolsErrors.MissingAddonFile({ addon: name, file });
    }
    const manifest = checkManifest(name, files);
    const metadata = parseAddonMetadata(name, files.get('addon.json')!);
    for (const [i, screenshot] of (metadata.screenshots ?? []).entries()) {
        if (!media.has(screenshot.file))
            throw new AddonToolsErrors.InvalidAddonJson({
                addon: name,
                problem: `screenshots[${i}].file ${screenshot.file} does not exist`
            });
    }
    const icon = files.get(ADDON_ICON_FILE);
    if (icon) checkIcon(name, icon);

    const title = metadata.title ?? readmeTitle(new TextDecoder().decode(files.get('README.md'))) ?? manifest.name;
    return { name, version: manifest.version, ...metadata, title, files, media };
};

/**
 * Zips an addon into its `.mcpack`. Entries are stored in path order and dated 1980-01-01, so
 * the same files always give the same bytes and the same hash, on any machine.
 */
export const packAddon = (addon: Addon): AddonPack => {
    const bytes = writeZip(addon.files);
    return { fileName: packFileName(addon.name, addon.version), bytes, sha256: sha256Of(bytes) };
};

/** A release file from its name and bytes. */
const releaseFile = (fileName: string, bytes: Uint8Array): AddonReleaseFile => ({
    fileName,
    bytes,
    sha256: sha256Of(bytes)
});

/**
 * The files a release attaches beside an addon's pack for the marketplace: its README, its icon
 * and its screenshots, each named for the addon and version so a published version's files stay
 * fixed.
 */
export const addonListingFiles = (addon: Addon): AddonListingFiles => {
    const base = `${addon.name}-${addon.version}`;
    const icon = addon.files.get(ADDON_ICON_FILE);
    return {
        readme: releaseFile(`${base}.md`, addon.files.get('README.md')!),
        ...(icon ? { icon: releaseFile(`${base}.png`, icon) } : {}),
        screenshots: (addon.screenshots ?? []).map(({ file, alt }, i) => ({
            ...releaseFile(`${base}-${i + 1}${path.posix.extname(file).toLowerCase()}`, addon.media.get(file)!),
            alt,
            file
        }))
    };
};

/** Every file of a listing, README first. */
export const listingFileList = (files: AddonListingFiles): AddonReleaseFile[] => [
    files.readme,
    ...(files.icon ? [files.icon] : []),
    ...files.screenshots
];

/**
 * The index entry for an addon's pack, with the listing that names its listing files.
 * @param baseUrl - Where the release's files download from; each file's name is added to it.
 * @param listing - The addon's listing files, as {@link addonListingFiles} gives them.
 */
export const addonIndexEntry = (
    addon: Addon,
    pack: AddonPack,
    baseUrl: string,
    listing: AddonListingFiles = addonListingFiles(addon)
): AddonIndexEntry => {
    const link = (file: AddonReleaseFile) => ({ url: fileUrl(baseUrl, file.fileName), sha256: file.sha256 });
    const entryListing: AddonListing = {
        title: addon.title,
        license: addon.license,
        tags: addon.tags ?? [],
        authors: addon.authors ?? [],
        ...(addon.deprecated === undefined ? {} : { deprecated: addon.deprecated }),
        ...(addon.replacedBy === undefined ? {} : { replacedBy: addon.replacedBy }),
        readme: link(listing.readme),
        ...(listing.icon ? { icon: link(listing.icon) } : {}),
        screenshots: listing.screenshots.map((shot) => ({ ...link(shot), alt: shot.alt, file: shot.file }))
    };
    return {
        name: addon.name,
        version: addon.version,
        description: addon.description,
        minServer: addon.minServer,
        url: fileUrl(baseUrl, pack.fileName),
        sha256: pack.sha256,
        listing: entryListing
    };
};
