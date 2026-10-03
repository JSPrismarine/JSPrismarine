import { compareBytewise } from '../util/Comparator';
import { compareInternalKeys, extractUserKey } from '../format/InternalKey';
import { CorruptionError } from '../Errors';
import type { FileMetaData, VersionEdit } from './VersionEdit';

/** Upstream's limit. Levels beyond this do not exist in any database the game writes. */
export const MAX_LEVELS = 7;

/**
 * Which table files are live, at which level.
 *
 * Level 0 is special: its files come straight from memtable flushes, so their key ranges overlap
 * and they must be searched newest first. Every level below holds a sorted, non-overlapping run,
 * which is what lets a lookup binary-search one file per level. Breaking that invariant in a
 * level we write is the one thing here that would corrupt a database for the game as well as
 * for us, so `applyEdit` checks it.
 */
export class VersionSet {
    private readonly levels: FileMetaData[][] = Array.from({ length: MAX_LEVELS }, () => []);

    public nextFileNumber = 2;
    public lastSequence = 0n;
    public logNumber = 0;
    public previousLogNumber = 0;

    public files(level: number): readonly FileMetaData[] {
        return this.levels[level] ?? [];
    }

    public get totalFiles(): number {
        return this.levels.reduce((total, files) => total + files.length, 0);
    }

    public allFiles(): Array<{ level: number; file: FileMetaData }> {
        return this.levels.flatMap((files, level) => files.map((file) => ({ level, file })));
    }

    public allocateFileNumber(): number {
        return this.nextFileNumber++;
    }

    public applyEdit(edit: VersionEdit): void {
        if (edit.logNumber !== undefined) this.logNumber = edit.logNumber;
        if (edit.previousLogNumber !== undefined) this.previousLogNumber = edit.previousLogNumber;
        if (edit.nextFileNumber !== undefined) this.nextFileNumber = edit.nextFileNumber;
        if (edit.lastSequence !== undefined && edit.lastSequence > this.lastSequence) {
            this.lastSequence = edit.lastSequence;
        }

        for (const [level, number] of edit.deletedFiles ?? []) {
            const files = this.levels[level];
            if (!files) continue;

            const at = files.findIndex((file) => file.number === number);
            if (at !== -1) files.splice(at, 1);
        }

        for (const [level, file] of edit.newFiles ?? []) {
            if (level < 0 || level >= MAX_LEVELS) throw new CorruptionError(`Manifest names level ${level}`);

            this.levels[level]!.push(file);
            if (file.number >= this.nextFileNumber) this.nextFileNumber = file.number + 1;
        }

        this.sortLevels();
    }

    private sortLevels(): void {
        // Level 0 by file number descending: newest first, which is the order a lookup needs.
        this.levels[0]!.sort((a, b) => b.number - a.number);

        for (let level = 1; level < MAX_LEVELS; level++) {
            this.levels[level]!.sort((a, b) => compareInternalKeys(a.smallest, b.smallest));
        }
    }

    /** Throws if any level below 0 has overlapping files, which would break every reader. */
    public assertSortedRuns(): void {
        for (let level = 1; level < MAX_LEVELS; level++) {
            const files = this.levels[level]!;
            for (let i = 1; i < files.length; i++) {
                if (compareInternalKeys(files[i - 1]!.largest, files[i]!.smallest) >= 0) {
                    throw new CorruptionError(
                        `Level ${level} files ${files[i - 1]!.number} and ${files[i]!.number} overlap`
                    );
                }
            }
        }
    }

    /**
     * The files that could hold `userKey`, in the order they must be consulted: level 0 newest
     * first, then at most one file per level below.
     */
    public *candidates(userKey: Buffer): IterableIterator<{ level: number; file: FileMetaData }> {
        for (const file of this.levels[0]!) {
            if (this.mayContain(file, userKey)) yield { level: 0, file };
        }

        for (let level = 1; level < MAX_LEVELS; level++) {
            const file = this.findFile(this.levels[level]!, userKey);
            if (file !== null) yield { level, file };
        }
    }

    private mayContain(file: FileMetaData, userKey: Buffer): boolean {
        return (
            compareBytewise(userKey, extractUserKey(file.smallest)) >= 0 &&
            compareBytewise(userKey, extractUserKey(file.largest)) <= 0
        );
    }

    /** Binary search over a sorted run for the one file whose range covers `userKey`. */
    private findFile(files: FileMetaData[], userKey: Buffer): FileMetaData | null {
        let low = 0;
        let high = files.length;

        while (low < high) {
            const middle = (low + high) >>> 1;
            if (compareBytewise(extractUserKey(files[middle]!.largest), userKey) < 0) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }

        const file = files[low];
        return file !== undefined && this.mayContain(file, userKey) ? file : null;
    }

    /** Everything in `level` whose range touches `[smallest, largest]`. */
    public overlapping(level: number, smallest: Buffer, largest: Buffer): FileMetaData[] {
        return (this.levels[level] ?? []).filter(
            (file) =>
                compareBytewise(extractUserKey(file.smallest), extractUserKey(largest)) <= 0 &&
                compareBytewise(extractUserKey(file.largest), extractUserKey(smallest)) >= 0
        );
    }

    /** A single edit that reproduces the whole current state, for a freshly written manifest. */
    public snapshot(comparator: string): VersionEdit {
        return {
            comparator,
            logNumber: this.logNumber,
            previousLogNumber: this.previousLogNumber,
            nextFileNumber: this.nextFileNumber,
            lastSequence: this.lastSequence,
            newFiles: this.allFiles().map(({ level, file }) => [level, file] as [number, FileMetaData])
        };
    }
}

export default VersionSet;
