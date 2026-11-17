/**
 * Reads and checks `corpus/packs.json`, the pins of the add-on corpus. The file is the only record
 * of the corpus in the repository: each repository is a URL, a full commit and the sha256 of its
 * codeload zip, and each pack in it names its `manifest.json` and its script directories.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isRecord } from '../isRecord.mts';

/** The `corpus` directory of the package, which holds the manifest and the generated counts. */
export const CORPUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../corpus');

/** Where the manifest is. */
export const MANIFEST_PATH = join(CORPUS_DIR, 'packs.json');

/**
 * The SPDX ids of the licenses the corpus accepts: permissive licenses that allow use without
 * conditions on our code. Copyleft licenses such as GPL, and repositories with no license, stay out.
 */
export const ACCEPTED_LICENSES = [
    '0BSD',
    'Apache-2.0',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'CC0-1.0',
    'ISC',
    'MIT',
    'Unlicense',
    'Zlib'
] as const;

/** One behavior pack inside a pinned repository. */
export interface CorpusPack {
    /** A short id, unique across the corpus, that the counts are keyed by. */
    readonly id: string;
    /** The pack's `manifest.json`, relative to the repository root. */
    readonly manifest: string;
    /** Directories the pack's scripts are read from, relative to the repository root. */
    readonly sources: readonly string[];
    /** Paths under `sources` to leave out, relative to the repository root. */
    readonly exclude: readonly string[];
    /** For a pack read from TypeScript sources, what its build step would do. */
    readonly build?: string;
}

/** A pack or path in a pinned repository that the corpus leaves out. */
export interface ExcludedPath {
    readonly path: string;
    readonly reason: string;
}

/** One pinned repository and the packs read from it. */
export interface CorpusRepository {
    readonly url: string;
    /** `owner/name`, from the URL. */
    readonly name: string;
    /** The full 40-character commit hash. */
    readonly commit: string;
    /** The sha256 of the codeload zip of the commit. */
    readonly sha256: string;
    /** The SPDX id of the license, one of {@link ACCEPTED_LICENSES}. */
    readonly license: string;
    readonly packs: readonly CorpusPack[];
    readonly excluded: readonly ExcludedPath[];
}

/** A candidate repository the corpus leaves out as a whole. */
export interface ExcludedRepository {
    readonly url: string;
    /** The SPDX id GitHub reports, or null when it identifies none. */
    readonly license: string | null;
    readonly reason: string;
}

/** The whole manifest. */
export interface CorpusManifest {
    readonly repositories: readonly CorpusRepository[];
    readonly excluded: readonly ExcludedRepository[];
}

const GITHUB_URL = /^https:\/\/github\.com\/(?<name>[\w.-]+\/[\w.-]+)$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** Fails with the manifest's path and where in it the problem is. */
const fail = (where: string, problem: string): never => {
    throw new Error(`${MANIFEST_PATH}: ${where} ${problem}`);
};

const readString = (record: Record<string, unknown>, key: string, where: string): string => {
    const value = record[key];
    return typeof value === 'string' && value !== '' ? value : fail(where, `needs a string \`${key}\``);
};

const readStrings = (record: Record<string, unknown>, key: string, where: string): string[] => {
    const value = record[key] ?? [];
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string'))
        return fail(where, `needs \`${key}\` to be a list of strings`);
    return value;
};

const readRecords = (record: Record<string, unknown>, key: string, where: string): Record<string, unknown>[] => {
    const value = record[key] ?? [];
    if (!Array.isArray(value) || !value.every(isRecord)) return fail(where, `needs \`${key}\` to be a list of objects`);
    return value;
};

const readExcludedPaths = (record: Record<string, unknown>, where: string): ExcludedPath[] =>
    readRecords(record, 'excluded', where).map((entry, index) => ({
        path: readString(entry, 'path', `${where} excluded[${index}]`),
        reason: readString(entry, 'reason', `${where} excluded[${index}]`)
    }));

const readPack = (record: Record<string, unknown>, where: string): CorpusPack => {
    const sources = readStrings(record, 'sources', where);
    if (sources.length === 0) fail(where, 'needs at least one source directory');
    const build = record.build;
    if (build !== undefined && typeof build !== 'string') fail(where, 'needs `build` to be a string');
    return {
        id: readString(record, 'id', where),
        manifest: readString(record, 'manifest', where),
        sources,
        exclude: readStrings(record, 'exclude', where),
        ...(typeof build === 'string' ? { build } : {})
    };
};

const readRepository = (record: Record<string, unknown>, where: string): CorpusRepository => {
    const url = readString(record, 'url', where);
    const name = GITHUB_URL.exec(url)?.groups?.name ?? fail(where, `has ${url}, which is not a GitHub repository URL`);
    const commit = readString(record, 'commit', where);
    if (!COMMIT.test(commit)) fail(where, `pins ${commit}, which is not a full commit hash`);
    const sha256 = readString(record, 'sha256', where);
    if (!SHA256.test(sha256)) fail(where, `has ${sha256}, which is not a sha256 digest`);
    const license = readString(record, 'license', where);
    if (!(ACCEPTED_LICENSES as readonly string[]).includes(license))
        fail(where, `is licensed ${license}, which the corpus does not accept`);
    const packs = readRecords(record, 'packs', where).map((pack, index) => readPack(pack, `${name} packs[${index}]`));
    if (packs.length === 0) fail(where, 'pins no pack');
    return { url, name, commit, sha256, license, packs, excluded: readExcludedPaths(record, name) };
};

/**
 * Checks a parsed manifest and returns it typed.
 * @throws {Error} Naming the entry, when a field is missing or malformed, a commit is not a full
 * hash, a license is not one of {@link ACCEPTED_LICENSES}, or two packs share an id.
 */
export const parseCorpusManifest = (value: unknown): CorpusManifest => {
    if (!isRecord(value)) return fail('the manifest', 'is not an object');
    const repositories = readRecords(value, 'repositories', 'the manifest').map((entry, index) =>
        readRepository(entry, `repositories[${index}]`)
    );
    const excluded = readRecords(value, 'excluded', 'the manifest').map((entry, index) => {
        const where = `excluded[${index}]`;
        const license = entry.license;
        if (license !== null && typeof license !== 'string') fail(where, 'needs `license` to be a string or null');
        return {
            url: readString(entry, 'url', where),
            license: typeof license === 'string' ? license : null,
            reason: readString(entry, 'reason', where)
        };
    });
    const seen = new Set<string>();
    for (const pack of repositories.flatMap((repository) => repository.packs)) {
        if (seen.has(pack.id)) fail(`pack ${pack.id}`, 'appears twice');
        seen.add(pack.id);
    }
    return { repositories, excluded };
};

/** Reads and checks the checked-in manifest. */
export const readCorpusManifest = (path: string = MANIFEST_PATH): CorpusManifest =>
    parseCorpusManifest(JSON.parse(readFileSync(path, 'utf8')));
