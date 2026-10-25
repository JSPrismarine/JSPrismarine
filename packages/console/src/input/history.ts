import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Default number of entries a history keeps before it drops the oldest. */
export const DEFAULT_HISTORY_CAPACITY = 1000;

/**
 * Submitted command lines with shell-style navigation.
 *
 * Entries are stored oldest first. Consecutive duplicates collapse into one entry and blank
 * lines are ignored, so Up never shows the same line twice in a row. Navigation keeps a cursor
 * that starts past the newest entry; `previous` stashes the caller's draft on the first step
 * back so `next` can return it when the cursor walks forward again.
 */
export class CommandHistory {
    private lines: string[] = [];
    private cursor = 0;
    private draft: string | undefined;

    /**
     * @param capacity - Maximum number of entries kept; the oldest entries are dropped first.
     */
    public constructor(private readonly capacity = DEFAULT_HISTORY_CAPACITY) {}

    /** Entries from oldest to newest. */
    public get entries(): readonly string[] {
        return this.lines;
    }

    /**
     * Records a submitted line and moves the cursor back past the newest entry.
     *
     * Whitespace around the line is trimmed. Blank lines and a line equal to the newest entry
     * are not recorded.
     */
    public push(line: string): void {
        const trimmed = line.trim();
        if (trimmed.length > 0 && trimmed !== this.lines.at(-1)) {
            this.lines.push(trimmed);
            if (this.lines.length > this.capacity) {
                this.lines.splice(0, this.lines.length - this.capacity);
            }
        }
        this.reset();
    }

    /**
     * Steps the cursor to the older neighbor and returns that entry.
     *
     * @param draft - The line being edited; stashed on the first step so `next` can restore it.
     * @returns The older entry, or undefined when the cursor is already at the oldest entry.
     */
    public previous(draft: string): string | undefined {
        if (this.cursor === 0) return undefined;
        if (this.cursor === this.lines.length) this.draft = draft;
        this.cursor -= 1;
        return this.lines[this.cursor];
    }

    /**
     * Steps the cursor to the newer neighbor and returns that entry.
     *
     * @returns The newer entry, the stashed draft when stepping past the newest entry, or
     * undefined when the cursor is not inside the history.
     */
    public next(): string | undefined {
        if (this.cursor >= this.lines.length) return undefined;
        this.cursor += 1;
        if (this.cursor === this.lines.length) {
            const draft = this.draft ?? '';
            this.draft = undefined;
            return draft;
        }
        return this.lines[this.cursor];
    }

    /** Moves the cursor past the newest entry and forgets the stashed draft. */
    public reset(): void {
        this.cursor = this.lines.length;
        this.draft = undefined;
    }

    /**
     * Finds the newest entry that contains the query, for reverse search.
     *
     * @returns The newest matching entry, or undefined for an empty query or no match.
     */
    public search(query: string): string | undefined {
        if (query.length === 0) return undefined;
        return this.lines.findLast((line) => line.includes(query));
    }

    /**
     * Appends the lines of a history file, one entry per line. A missing file is treated as
     * empty; other read errors propagate.
     */
    public async load(file: string): Promise<void> {
        let content: string;
        try {
            content = await readFile(file, 'utf8');
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
            throw error;
        }
        for (const line of content.split('\n')) this.push(line);
    }

    /** Writes the entries to a file, one per line, creating parent directories as needed. */
    public async save(file: string): Promise<void> {
        await mkdir(dirname(file), { recursive: true });
        const content = this.lines.map((line) => `${line}\n`).join('');
        await writeFile(file, content, 'utf8');
    }
}
