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

    /** Visits point-lookup candidates without creating an iterator or candidate wrapper objects. */
    public visitCandidates(userKey: Buffer, visit: (file: FileMetaData) => boolean): boolean {
        for (const file of this.levels[0]!) {
            if (this.mayContain(file, userKey) && visit(file)) return true;
        }

        for (let level = 1; level < MAX_LEVELS; level++) {
            const file = this.findFile(this.levels[level]!, userKey);
            if (file !== null && visit(file)) return true;
        }

        return false;
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

    /**
     * `inputs` plus every file of `level` that continues the last input's final user key.
     *
     * A sorted run can split one user key's versions across two neighboring files, newest in the
     * first. Upstream LevelDB wrote such splits before 1.23, so a world the game saved can hold
     * them. Compacting only the first file would move the newest version below an older one that
     * stays behind, and every later read would return the stale value. Upstream's
     * `AddBoundaryInputs` closes the same hole.
     *
     * @param level - The level the inputs come from, 1 or deeper.
     * @param inputs - Files picked from that level.
     */
    public withBoundaryInputs(level: number, inputs: readonly FileMetaData[]): FileMetaData[] {
        const result = [...inputs];
        if (result.length === 0) return result;

        let largest = result.reduce(
            (max, file) => (compareInternalKeys(file.largest, max) > 0 ? file.largest : max),
            result[0]!.largest
        );
        for (;;) {
            let boundary: FileMetaData | null = null;
            for (const file of this.levels[level] ?? []) {
                if (compareInternalKeys(file.smallest, largest) <= 0) continue;
                if (compareBytewise(extractUserKey(file.smallest), extractUserKey(largest)) !== 0) continue;
                if (boundary === null || compareInternalKeys(file.smallest, boundary.smallest) < 0) boundary = file;
            }

            if (boundary === null || result.includes(boundary)) return result;
            result.push(boundary);
            largest = boundary.largest;
        }
    }

    /**
     * Whether any level below `level` can still contain an older version of `userKey`.
     *
     * @param level - The level being compacted into.
     * @param userKey - The user key without its sequence number or value type.
     */
    public hasOlderFile(level: number, userKey: Buffer): boolean {
        for (let deeper = level + 1; deeper < MAX_LEVELS; deeper++) {
            if (this.findFile(this.levels[deeper]!, userKey) !== null) return true;
        }

        return false;
    }

    /** A single edit that reproduces the whole current state, for a freshly written manifest. */
    public snapshot(comparator: string): VersionEdit {
        return {
            comparator,
            logNumber: this.logNumber,
            previousLogNumber: this.previousLogNumber,
            nextFileNumber: this.nextFileNumber,
            lastSequence: this.lastSequence,
            newFiles: this.allFiles().map(({ level, file }) => [level, file])
        };
    }
}

export default VersionSet;
