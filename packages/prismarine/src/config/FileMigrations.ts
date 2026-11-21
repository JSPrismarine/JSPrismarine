/**
 * Versioned upgrades of the JSON files the server owns. A file names its layout in a version key,
 * `schemaVersion` unless its definition says otherwise, and each release that changes a file's
 * shape or defaults adds one step that takes the previous version to the next. Loading a file runs
 * every step from its version to the current one, in order, keeps the original beside it and
 * writes the result once. `CONTRIBUTING.md` explains how to add a step.
 */
import fs from 'node:fs';
import path from 'node:path';

import type { Logger } from '@jsprismarine/logger';
import { PrismarineServerErrors } from '@jsprismarine/errors/prismarine/server';

import { hasErrorCode } from '../utils/hasErrorCode';
import { isRecord } from '../utils/isRecord';
import type { ConfigDocument } from './ConfigDocument';
import { parseConfigDocument } from './ConfigDocument';
import { NEW_FILE_MODE, writeJsonFile } from './JsonFile';

/** One upgrade of a file, from the version before {@link MigrationStep.to} to `to`. */
export interface MigrationStep {
    /** The version the step produces. It runs on a file one version below. */
    readonly to: number;
    /**
     * Changes the document to the next version's shape, in place so comments and key order
     * survive, or answers a new document that replaces it. The runner writes the version key
     * afterwards, so a step leaves it alone. A step may throw a catalog error to refuse a file it
     * cannot upgrade; nothing is written then.
     */
    readonly migrate: (document: ConfigDocument) => ConfigDocument | undefined;
}

/** How one file is versioned and upgraded. */
export interface FileMigrations {
    /** The file's name, for errors and the log. */
    readonly fileName: string;
    /** The top-level key that holds the version. Defaults to `schemaVersion`. */
    readonly versionKey?: string;
    /** Written above the version key when a step adds it to a file that had none. */
    readonly versionComment?: string;
    /**
     * The version of a file without the version key, which is the oldest version a step starts
     * from: the layout the server wrote before the file had a version.
     */
    readonly unversioned: number;
    /** The version this server writes. A file above it is refused. */
    readonly current: number;
    /** One step per version from `unversioned + 1` to `current`, in order. */
    readonly steps: readonly MigrationStep[];
    /** Where a new top-level key goes, as {@link parseConfigDocument} takes it. */
    readonly keyOrder?: readonly string[];
}

/** What the log is given: a migration writes one info line per file. */
export type MigrationLogger = Pick<Logger, 'info'>;

/** A document at the current version, with the version it was read at. */
export interface MigratedDocument {
    readonly document: ConfigDocument;
    readonly from: number;
    readonly to: number;
}

/** A file at the current version, as {@link migrateFile} leaves it on disk. */
export interface MigratedFile extends MigratedDocument {
    /** The text the file holds now. */
    readonly text: string;
    /** Where the original went, when a step ran. */
    readonly backup?: string;
}

const DEFAULT_VERSION_KEY = 'schemaVersion';

/** The key a definition keeps its version in. */
export const versionKeyOf = (migrations: FileMigrations): string => migrations.versionKey ?? DEFAULT_VERSION_KEY;

/**
 * Throws unless the steps run `unversioned + 1`, `unversioned + 2` and so on up to `current`, so a
 * missing or repeated step fails the first load that would run it, and every test that loads it.
 */
const checkSteps = (migrations: FileMigrations): void => {
    const { fileName, unversioned, current, steps } = migrations;
    const misdeclared = (index: number, to: number) =>
        new PrismarineServerErrors.FileMigrationsMisdeclared({ fileName, oldest: unversioned, current, index, to });
    steps.forEach((step, index) => {
        if (step.to !== unversioned + index + 1) throw misdeclared(index, step.to);
    });
    if (unversioned + steps.length !== current) throw misdeclared(steps.length, unversioned + steps.length);
};

/**
 * The version a parsed file declares.
 * @throws VersionedFileNotObject when the root is not an object, FileVersionInvalid when the version
 *   is not a whole number from `unversioned` up, FileVersionTooNew when it is above `current`.
 */
export const fileVersionOf = (migrations: FileMigrations, document: ConfigDocument): number => {
    const { fileName, unversioned, current } = migrations;
    const versionKey = versionKeyOf(migrations);
    const root = document.get([]);
    if (root !== undefined && !isRecord(root)) throw new PrismarineServerErrors.VersionedFileNotObject({ fileName });
    if (root === undefined || !(versionKey in root)) return unversioned;
    const version = root[versionKey];
    const shown = JSON.stringify(version);
    if (typeof version !== 'number' || !Number.isInteger(version) || version < unversioned) {
        throw new PrismarineServerErrors.FileVersionInvalid({
            fileName,
            versionKey,
            version: shown,
            oldest: unversioned,
            current
        });
    }
    if (version > current) {
        throw new PrismarineServerErrors.FileVersionTooNew({ fileName, versionKey, version: shown, current });
    }
    return version;
};

/**
 * Runs every step from the document's version to the current one, in order. Pure: it reads and
 * writes nothing on disk, and a document already at the current version comes back as it was.
 * @throws What {@link fileVersionOf} throws, FileMigrationsMisdeclared for a broken definition,
 *   and whatever a step throws.
 */
export const migrateDocument = (migrations: FileMigrations, document: ConfigDocument): MigratedDocument => {
    checkSteps(migrations);
    const from = fileVersionOf(migrations, document);
    const versionKey = versionKeyOf(migrations);
    let migrated = document;
    for (const step of migrations.steps.slice(from - migrations.unversioned)) {
        migrated = step.migrate(migrated) ?? migrated;
        migrated.set([versionKey], step.to, migrations.versionComment);
    }
    return { document: migrated, from, to: migrations.current };
};

/** Where the original of a file at `version` goes: `permissions.json.v1.bak` for a version 1 file. */
export const backupPathOf = (filePath: string, version: number, attempt = 1): string =>
    `${filePath}.v${version}${attempt === 1 ? '' : `-${attempt}`}.bak`;

/**
 * Writes `text` beside the file under the first backup name not taken, with the file's own mode.
 * An earlier backup is never overwritten, since it may be the only copy of an older file.
 */
const keepOriginal = async (filePath: string, version: number, text: string): Promise<string> => {
    const mode = await fs.promises.stat(filePath).then(
        (stats) => stats.mode & 0o777,
        () => NEW_FILE_MODE
    );
    for (let attempt = 1; ; attempt++) {
        const backup = backupPathOf(filePath, version, attempt);
        try {
            await fs.promises.writeFile(backup, text, { encoding: 'utf8', flag: 'wx', flush: true, mode });
            return backup;
        } catch (error: unknown) {
            if (!hasErrorCode(error, 'EEXIST')) throw error;
        }
    }
};

/**
 * Reads a versioned file and brings it to the current version. A file at the current version is
 * returned as it is and not written. An older one runs every step up to current in memory first;
 * only once they all succeed is the original kept beside it ({@link backupPathOf}) and the result
 * written in its place, atomically, with one log line naming both versions. A step that throws
 * leaves the file and the disk untouched.
 * @returns The file at the current version, or undefined when there is no file, which the caller
 *   creates fresh. A blank file reads as `{}`, a file with no version.
 * @throws What {@link migrateDocument} throws, ConfigSyntaxError when the file does not parse.
 */
export const migrateFile = async (
    filePath: string,
    migrations: FileMigrations,
    logger: MigrationLogger
): Promise<MigratedFile | undefined> => {
    let text: string;
    try {
        text = await fs.promises.readFile(filePath, 'utf8');
    } catch (error: unknown) {
        if (hasErrorCode(error, 'ENOENT')) return undefined;
        throw error;
    }
    const document = parseConfigDocument(text.trim() === '' ? '{}' : text, migrations.keyOrder);
    const migrated = migrateDocument(migrations, document);
    if (migrated.from === migrated.to) return { ...migrated, text };

    const backup = await keepOriginal(filePath, migrated.from, text);
    const written = await writeJsonFile(filePath, migrated.document);
    logger.info(
        `Migrated ${migrations.fileName} from version ${migrated.from} to version ${migrated.to}; the original is ${path.basename(backup)}.`
    );
    return { ...migrated, text: written, backup };
};
