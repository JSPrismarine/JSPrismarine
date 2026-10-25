import type { LogEntry } from '@jsprismarine/console-protocol';
import { isAtLeastLevel } from '@jsprismarine/logger';
import type { LogLevel } from '@jsprismarine/logger';
import type { RawStream, StoredRecord } from './types';

/** Options for {@link LogStore}. */
export interface LogStoreOptions {
    /** Records kept before the oldest is evicted. Defaults to 10 000. */
    capacity?: number;
}

/**
 * What changed in a {@link LogStore}. `append` reports how many records joined the end of the
 * visible list and how many the ring buffer evicted from its front, so a paused window can keep
 * its anchor and count unread lines; `reset` means the visible list was rebuilt and indices into
 * it are stale.
 */
export type LogStoreChange = { type: 'append'; count: number; evicted: number } | { type: 'reset' };

/** Direction for the jump helpers: `1` toward newer records, `-1` toward older ones. */
export type JumpDirection = 1 | -1;

const DEFAULT_CAPACITY = 10_000;

/**
 * Ring buffer of log records with the level filter, namespace filter, and search state the log
 * pane and status bar read. `visible()` is cached and updated in place on append, so a store near
 * capacity costs the same per record as an empty one. Filters never hide separators, raw child
 * output, or dropped notices. Search highlights rather than hides.
 */
export class LogStore {
    private readonly capacity: number;
    private readonly slots: (StoredRecord | undefined)[];
    private start = 0;
    private count = 0;
    private evictedCount = 0;
    private currentGeneration = 1;
    private lastSeq = 0;

    private maxLevel: LogLevel | undefined;
    private namespacePattern: { needle: string; invert: boolean } | undefined;
    private searchNeedle: string | undefined;

    private visibleCache: StoredRecord[] = [];
    private visibleFrozen: readonly StoredRecord[] | undefined;
    /** Indices into `visibleCache` that match the search; kept in step by `push`, rebuilt otherwise. */
    private matchCache: number[] = [];
    private hidden = 0;
    private readonly listeners = new Set<(change: LogStoreChange) => void>();

    public constructor(options: LogStoreOptions = {}) {
        this.capacity = Math.max(1, options.capacity ?? DEFAULT_CAPACITY);
        this.slots = new Array(this.capacity);
    }

    /** Number of records currently held, at most the capacity. */
    public get size(): number {
        return this.count;
    }

    /** Records pushed out by the ring buffer since the store was created. */
    public get evicted(): number {
        return this.evictedCount;
    }

    /** Current generation; bumped by {@link startGeneration}. */
    public get generation(): number {
        return this.currentGeneration;
    }

    /** Stored log records the filters hide. Separators, raw lines, and dropped notices never count. */
    public get hiddenCount(): number {
        return this.hidden;
    }

    /** Indices into {@link visible} whose message contains the search query. Empty without a query. */
    public get matches(): readonly number[] {
        return this.matchCache;
    }

    /** Appends a server log entry to the current generation. */
    public append(entry: LogEntry): void {
        this.lastSeq = entry.seq;
        this.push({ ...entry, generation: this.currentGeneration, kind: 'log' });
    }

    /** Appends one line of child process output, attributed to the generation that produced it. */
    public appendRaw(stream: RawStream, text: string, generation: number): void {
        this.push({ ...this.synthetic(text, Date.now()), generation, kind: 'raw', stream, namespace: stream });
    }

    /** Records that the server discarded `count` log lines under back pressure. */
    public appendDropped(count: number): void {
        this.push({
            ...this.synthetic(`${count} log lines were dropped`, Date.now()),
            generation: this.currentGeneration,
            kind: 'dropped',
            count
        });
    }

    /**
     * Starts a new generation, such as after a server restart, and inserts a separator record that
     * carries the reason and timestamp.
     *
     * @param reason - Short text shown on the separator rule, such as `server restarted`.
     * @param at - Unix epoch milliseconds for the separator.
     * @returns The new generation number.
     */
    public startGeneration(reason: string, at: number): number {
        this.currentGeneration += 1;
        this.push({ ...this.synthetic(reason, at), generation: this.currentGeneration, kind: 'separator' });
        return this.currentGeneration;
    }

    /** Hides log records less severe than `maxLevel`; `undefined` shows every level. */
    public setLevelFilter(maxLevel: LogLevel | undefined): void {
        this.maxLevel = maxLevel;
        this.rebuild();
    }

    /**
     * Keeps only log records whose namespace contains `pattern`, ignoring case. A leading `!`
     * inverts the match. `undefined` clears the filter.
     */
    public setNamespaceFilter(pattern: string | undefined): void {
        if (pattern === undefined || pattern === '' || pattern === '!') {
            this.namespacePattern = undefined;
        } else if (pattern.startsWith('!')) {
            this.namespacePattern = { needle: pattern.slice(1).toLowerCase(), invert: true };
        } else {
            this.namespacePattern = { needle: pattern.toLowerCase(), invert: false };
        }
        this.rebuild();
    }

    /** Sets the search query, matched case-insensitively against visible messages. */
    public setSearch(query: string | undefined): void {
        this.searchNeedle = query === undefined || query === '' ? undefined : query.toLowerCase();
        this.matchCache = this.collectMatches();
        this.notify({ type: 'reset' });
    }

    /** Records that pass the filters, oldest first. The same array is returned until the store changes. */
    public visible(): readonly StoredRecord[] {
        this.visibleFrozen ??= this.visibleCache.slice();
        return this.visibleFrozen;
    }

    /**
     * Index of the next search match after `from` in the given direction, wrapping around the
     * visible list. Undefined without matches.
     */
    public nextMatch(from: number, direction: JumpDirection): number | undefined {
        const matches = this.matches;
        if (matches.length === 0) return undefined;
        if (direction === 1) {
            return matches.find((index) => index > from) ?? matches[0];
        }
        for (let i = matches.length - 1; i >= 0; i -= 1) {
            if (matches[i]! < from) return matches[i];
        }
        return matches[matches.length - 1];
    }

    /** Index of the next visible log record at exactly `level` after `from`, without wrapping. */
    public nextOfLevel(from: number, level: LogLevel, direction: JumpDirection): number | undefined {
        const records = this.visibleCache;
        for (let i = from + direction; i >= 0 && i < records.length; i += direction) {
            const record = records[i]!;
            if (record.kind === 'log' && record.level === level) return i;
        }
        return undefined;
    }

    /** Subscribes to changes. Returns the unsubscribe function. */
    public onChange(listener: (change: LogStoreChange) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private synthetic(message: string, at: number): LogEntry {
        return { seq: this.lastSeq, level: 'info', namespace: '', at, message, formatted: message };
    }

    private push(record: StoredRecord): void {
        let evicted = 0;
        if (this.count === this.capacity) {
            const oldest = this.slots[this.start]!;
            this.start = (this.start + 1) % this.capacity;
            this.count -= 1;
            this.evictedCount += 1;
            if (this.passes(oldest)) {
                this.visibleCache.shift();
                evicted = 1;
                if (this.matchCache[0] === 0) this.matchCache.shift();
                for (let i = 0; i < this.matchCache.length; i += 1) this.matchCache[i]! -= 1;
            } else {
                this.hidden -= 1;
            }
        }
        this.slots[(this.start + this.count) % this.capacity] = record;
        this.count += 1;

        this.visibleFrozen = undefined;
        if (this.passes(record)) {
            this.visibleCache.push(record);
            if (this.matchesSearch(record)) this.matchCache.push(this.visibleCache.length - 1);
            this.notify({ type: 'append', count: 1, evicted });
        } else {
            this.hidden += 1;
            this.notify({ type: 'append', count: 0, evicted });
        }
    }

    private passes(record: StoredRecord): boolean {
        if (record.kind !== 'log') return true;
        if (this.maxLevel !== undefined && !isAtLeastLevel(record.level, this.maxLevel)) return false;
        const pattern = this.namespacePattern;
        if (pattern === undefined) return true;
        return record.namespace.toLowerCase().includes(pattern.needle) !== pattern.invert;
    }

    private rebuild(): void {
        this.visibleCache = [];
        this.hidden = 0;
        for (let i = 0; i < this.count; i += 1) {
            const record = this.slots[(this.start + i) % this.capacity]!;
            if (this.passes(record)) {
                this.visibleCache.push(record);
            } else {
                this.hidden += 1;
            }
        }
        this.visibleFrozen = undefined;
        this.matchCache = this.collectMatches();
        this.notify({ type: 'reset' });
    }

    private matchesSearch(record: StoredRecord): boolean {
        return this.searchNeedle !== undefined && record.message.toLowerCase().includes(this.searchNeedle);
    }

    private collectMatches(): number[] {
        if (this.searchNeedle === undefined) return [];
        const matches: number[] = [];
        this.visibleCache.forEach((record, index) => {
            if (this.matchesSearch(record)) matches.push(index);
        });
        return matches;
    }

    private notify(change: LogStoreChange): void {
        for (const listener of this.listeners) listener(change);
    }
}
