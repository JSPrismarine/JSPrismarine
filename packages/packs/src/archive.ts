/**
 * What a Bedrock content archive holds: the packs and worlds of an `.mcpack`, `.mcaddon`,
 * `.mcworld` or `.mctemplate`, each as its own set of files. The content build and the server's
 * addon installer both read archives through it, so the two agree on what an archive is.
 */
import { PacksErrors, ZipError } from '@jsprismarine/errors/packs';

import type { ZipBudget } from './zip';
import { createZipBudget, isZip, readZip } from './zip';

/** One pack or world an archive holds. */
export interface ArchiveMember {
    /**
     * Where it sits in the archive: a nested file's name such as `resources.mcpack`, a folder's
     * name with a trailing `/` such as `BP/`, or an empty string for an archive that is the member.
     */
    readonly name: string;
    /** A pack has `manifest.json` at its root; a world has `level.dat`. */
    readonly kind: 'pack' | 'world';
    /** Its files, by their path inside it. */
    readonly files: Map<string, Uint8Array>;
    /**
     * The content key of an encrypted pack, from the file beside it in an `.mcaddon`:
     * `<name>.key` for a nested `<name>`, such as `resources.mcpack.key`, or `<folder>.key` for a
     * folder. Undefined when there is none, and always for an archive that is the member.
     */
    readonly key?: Uint8Array;
}

/** A nested file the archive names but that does not read as a pack or a world. */
export interface ArchiveProblem {
    /** The nested file's name in the archive. */
    readonly name: string;
    readonly message: string;
}

/** What {@link readContentArchive} found. */
export interface ContentArchive {
    /** Every pack and world, nested files first in archive order, then folders in name order. */
    readonly members: readonly ArchiveMember[];
    readonly problems: readonly ArchiveProblem[];
}

/** Options for {@link readContentArchive}. */
export interface ContentArchiveOptions {
    /** What the archive and the archives nested in it may expand to, together. */
    readonly budget?: ZipBudget;
    /**
     * Sees the entries of the archive and of each archive nested in it before they are used, and
     * throws to refuse one, such as for a name that would land outside a folder.
     */
    readonly check?: (entries: ReadonlyMap<string, Uint8Array>) => void;
}

/** A nested archive that holds a pack, by its extension. */
const NESTED_PACK = /\.mcpack$/i;

/** A nested archive that holds a world, by its extension. */
const NESTED_WORLD = /\.(?:mcworld|mctemplate)$/i;

/** The first segment of a path in an archive. */
const rootOf = (name: string): string => name.split('/')[0]!;

/** The entries under one top-level folder, with that folder taken off their paths. */
const inside = (entries: ReadonlyMap<string, Uint8Array>, root: string): Map<string, Uint8Array> =>
    new Map(
        [...entries]
            .filter(([name]) => name.startsWith(`${root}/`))
            .map(([name, data]) => [name.slice(root.length + 1), data])
    );

/** What a set of files is when its root holds `level.dat` or `manifest.json`. */
const kindAtRoot = (entries: ReadonlyMap<string, Uint8Array>): ArchiveMember['kind'] | undefined => {
    // A world template has a manifest beside its level.dat, and is a world.
    if (entries.has('level.dat')) return 'world';
    if (entries.has('manifest.json')) return 'pack';
    return undefined;
};

/**
 * The one pack or world a set of files is: the files themselves when the root holds it, or the
 * inside of the only top-level folder when that folder does, as an archive zipped with its folder
 * has. Undefined for anything else, such as an `.mcaddon`.
 */
const singleMemberOf = (
    entries: ReadonlyMap<string, Uint8Array>
): { kind: ArchiveMember['kind']; files: Map<string, Uint8Array> } | undefined => {
    const kind = kindAtRoot(entries);
    if (kind !== undefined) return { kind, files: new Map(entries) };
    const roots = new Set([...entries.keys()].map(rootOf));
    const [root] = roots;
    if (roots.size !== 1 || root === undefined) return undefined;
    const files = inside(entries, root);
    const nested = kindAtRoot(files);
    return nested === undefined ? undefined : { kind: nested, files };
};

/**
 * Reads a content archive into the packs and worlds it holds.
 *
 * An `.mcpack`, `.mcworld` or `.mctemplate` is one member: its root holds `manifest.json` or
 * `level.dat`, or the only folder at its root does. An `.mcaddon` holds several, each a nested
 * `.mcpack`, `.mcworld` or `.mctemplate`, or a top-level folder with its own `manifest.json` or
 * `level.dat`. Anything else at the top of an `.mcaddon` is not a member.
 *
 * @throws {ZipError} When the archive itself does not read, or it and its nested archives together
 *   pass a size limit; a nested archive that does not read for another reason is listed in
 *   `problems` instead.
 */
export const readContentArchive = (bytes: Uint8Array, options: ContentArchiveOptions = {}): ContentArchive => {
    // One budget for the archive and every archive nested in it, so nesting cannot multiply it.
    const budget = options.budget ?? createZipBudget();
    const read = (data: Uint8Array): Map<string, Uint8Array> => {
        const entries = readZip(data, { budget });
        options.check?.(entries);
        return entries;
    };
    const entries = read(bytes);
    const single = singleMemberOf(entries);
    if (single !== undefined) return { members: [{ name: '', ...single }], problems: [] };

    const members: ArchiveMember[] = [];
    const problems: ArchiveProblem[] = [];
    for (const [name, data] of entries) {
        if (name.includes('/') || !(NESTED_PACK.test(name) || NESTED_WORLD.test(name))) continue;
        if (!isZip(data)) {
            problems.push({ name, message: `${name} is not a zip archive` });
            continue;
        }
        let nestedEntries: Map<string, Uint8Array>;
        try {
            nestedEntries = readZip(data, { budget });
        } catch (error) {
            // A size limit is the archive's as a whole, and stops the read; a nested archive that
            // is merely broken is one problem among its siblings.
            if (
                !(error instanceof ZipError) ||
                error instanceof PacksErrors.ZipArchiveTooLarge ||
                error instanceof PacksErrors.ZipEntryTooLarge
            )
                throw error;
            problems.push({ name, message: `${name} does not read: ${error.message}` });
            continue;
        }
        options.check?.(nestedEntries);
        const nested = singleMemberOf(nestedEntries);
        if (nested === undefined) {
            problems.push({ name, message: `${name} has no manifest.json or level.dat` });
            continue;
        }
        const key = entries.get(`${name}.key`);
        members.push({ name, ...nested, ...(key === undefined ? {} : { key }) });
    }
    const folders = [...new Set([...entries.keys()].filter((name) => name.includes('/')).map(rootOf))].sort();
    for (const root of folders) {
        const files = inside(entries, root);
        const kind = kindAtRoot(files);
        const key = entries.get(`${root}.key`);
        if (kind !== undefined) members.push({ name: `${root}/`, kind, files, ...(key === undefined ? {} : { key }) });
    }
    return { members, problems };
};
