import type { SegmentTone } from './segments';

/**
 * What a caller passes to show a toast.
 */
export interface ToastInput {
    tone: SegmentTone;
    text: string;
    /** A sticky toast stays until dismissed; `ttlMs` is ignored. */
    sticky?: boolean;
    /** Lifetime in milliseconds; falls back to the queue's default. */
    ttlMs?: number;
}

/**
 * A toast the queue tracks, with the identity and expiry the stack needs to render and time it.
 */
export interface Toast extends ToastInput {
    id: string;
    /** Timestamp the toast was pushed, on the caller's clock. */
    createdAt: number;
    /** Timestamp the toast expires, on the same clock; `undefined` for sticky toasts. */
    expiresAt?: number;
}

/**
 * Limits of a toast queue.
 */
export interface ToastQueueOptions {
    /** Toasts kept at once; pushing past this drops the oldest non-sticky toast. */
    maxVisible: number;
    /** Lifetime for toasts that set neither `sticky` nor `ttlMs`. */
    defaultTtlMs: number;
}

/**
 * Ordered toast state without timers or rendering. Callers pass the current time in, so the
 * queue works with any clock.
 */
export class ToastQueue {
    private entries: Toast[] = [];
    private nextId = 0;

    constructor(private readonly options: ToastQueueOptions) {}

    /** Live toasts, oldest first. */
    get toasts(): readonly Toast[] {
        return this.entries;
    }

    /**
     * Adds a toast and, while the queue is over `maxVisible`, evicts the oldest non-sticky toast
     * among the older ones, or the oldest toast when they are all sticky. The toast just pushed
     * is never the victim, so the returned id always names a visible toast.
     *
     * @param now - Current time on the caller's clock; `expiresAt` is derived from it.
     * @returns The new toast's id.
     */
    push(input: ToastInput, now: number): string {
        const id = `toast-${this.nextId++}`;
        const ttl = input.ttlMs ?? this.options.defaultTtlMs;
        this.entries.push({
            ...input,
            id,
            createdAt: now,
            expiresAt: input.sticky ? undefined : now + ttl
        });
        while (this.entries.length > this.options.maxVisible) {
            const victim = this.entries.slice(0, -1).findIndex((toast) => !toast.sticky);
            this.entries.splice(victim === -1 ? 0 : victim, 1);
        }
        return id;
    }

    /**
     * Removes one toast.
     *
     * @returns Whether a toast with that id was present.
     */
    dismiss(id: string): boolean {
        const before = this.entries.length;
        this.entries = this.entries.filter((toast) => toast.id !== id);
        return this.entries.length !== before;
    }

    /**
     * Removes every toast whose `expiresAt` is at or before `now`.
     *
     * @returns The ids removed, oldest first.
     */
    expire(now: number): string[] {
        const expired = this.entries.filter((toast) => toast.expiresAt !== undefined && toast.expiresAt <= now);
        if (expired.length > 0) this.entries = this.entries.filter((toast) => !expired.includes(toast));
        return expired.map((toast) => toast.id);
    }

    /** The earliest `expiresAt` among live toasts, or `undefined` when none expire. */
    nextExpiry(): number | undefined {
        let next: number | undefined;
        for (const toast of this.entries) {
            if (toast.expiresAt !== undefined && (next === undefined || toast.expiresAt < next)) next = toast.expiresAt;
        }
        return next;
    }

    /** Removes every toast, sticky or not. */
    clear(): void {
        this.entries = [];
    }
}
