/**
 * How many background generation tasks may run at once, steered by how the server is doing.
 *
 * The shape is TCP's: raise the number slowly while ticks arrive on time, cut it sharply when they
 * do not. The signal is tick lateness, the gap between when a tick was due and when it started,
 * and on Linux in a quota-limited control group the growth of the group's throttle counter. A
 * CPU quota is enforced per group, so a generator that spends it freezes the tick whatever its
 * priority is, and the only warning before that is the counter rising.
 *
 * `immediate` work never passes through here. A chunk a player stands on is always admitted; the
 * governor only decides how many `soon` and `idle` tasks may be with workers.
 */
import { readFileSync } from 'node:fs';

/** What a governor is built with. */
export interface ConcurrencyGovernorOptions {
    /** The most background tasks ever allowed at once: the number of workers. */
    readonly max: number;
    /** The fewest allowed. Defaults to 1, so background work always makes some progress. */
    readonly min?: number;
    /** Where the limit starts. Defaults to half of `max`, so a fresh server ramps up rather than bursts. */
    readonly initial?: number;
    /** A tick later than this counts as pressure, in milliseconds. Defaults to 25, half a tick. */
    readonly lateMs?: number;
    /** How long the server must stay calm before the limit rises by one, in milliseconds. Defaults to 1000. */
    readonly raiseEveryMs?: number;
    /** What the limit is multiplied by on pressure. Defaults to 0.5. */
    readonly decrease?: number;
    /** After pressure, how long before the limit may rise again, in milliseconds. Defaults to 2000. */
    readonly holdMs?: number;
}

/** What the server reports to the governor. */
export interface GovernorSignal {
    /** How late the latest tick started, in milliseconds. */
    readonly latenessMs: number;
    /** How many times the control group was throttled since the previous signal, when known. */
    readonly throttledDelta?: number;
}

/** A controller for the background concurrency limit. Pure: it reads no clock of its own. */
export class ConcurrencyGovernor {
    private current: number;
    private lastChangeAt: number | undefined;
    private holdUntil = Number.NEGATIVE_INFINITY;
    private readonly min: number;
    private readonly max: number;
    private readonly lateMs: number;
    private readonly raiseEveryMs: number;
    private readonly decrease: number;
    private readonly holdMs: number;

    public constructor(options: ConcurrencyGovernorOptions) {
        this.max = Math.max(1, Math.trunc(options.max));
        this.min = Math.min(this.max, Math.max(1, Math.trunc(options.min ?? 1)));
        this.current = Math.min(this.max, Math.max(this.min, Math.trunc(options.initial ?? this.max / 2)));
        this.lateMs = options.lateMs ?? 25;
        this.raiseEveryMs = options.raiseEveryMs ?? 1000;
        this.decrease = options.decrease ?? 0.5;
        this.holdMs = options.holdMs ?? 2000;
    }

    /** How many background tasks are allowed right now. */
    public get active(): number {
        return this.current;
    }

    /**
     * Feeds the governor one reading.
     *
     * @param signal - The latest tick lateness and, when known, the throttle growth.
     * @param nowMs - The time of the reading, from any monotonic clock the caller keeps.
     * @returns The limit after this reading.
     */
    public observe(signal: GovernorSignal, nowMs: number): number {
        this.lastChangeAt ??= nowMs;
        const pressured = signal.latenessMs > this.lateMs || (signal.throttledDelta ?? 0) > 0;

        if (pressured) {
            const lowered = Math.max(this.min, Math.floor(this.current * this.decrease));
            if (lowered !== this.current) this.current = lowered;
            this.lastChangeAt = nowMs;
            this.holdUntil = nowMs + this.holdMs;
        } else if (nowMs >= this.holdUntil && nowMs - this.lastChangeAt >= this.raiseEveryMs) {
            if (this.current < this.max) this.current++;
            this.lastChangeAt = nowMs;
        }

        return this.current;
    }
}

/** The throttle counters of a control group, as `cpu.stat` reports them. */
export interface CpuThrottleStat {
    readonly nrPeriods: number;
    readonly nrThrottled: number;
    /** Time spent throttled, in microseconds. */
    readonly throttledUsec: number;
}

/**
 * Reads the throttle counters out of a `cpu.stat` file.
 *
 * Both layouts are flat keyed files of `KEY VALUE` lines. Version 2 reports `throttled_usec` in
 * microseconds ([cgroup-v2](https://docs.kernel.org/admin-guide/cgroup-v2.html)); version 1
 * reports `throttled_time` in nanoseconds
 * ([sched-bwc](https://docs.kernel.org/scheduler/sched-bwc.html)). A group with no CPU controller
 * has none of the three keys.
 *
 * @returns The counters, or undefined when the file has no throttle keys.
 */
export const parseCpuStat = (text: string): CpuThrottleStat | undefined => {
    const values = new Map<string, number>();
    for (const line of text.split('\n')) {
        const [key, value] = line.trim().split(/\s+/);
        if (key !== undefined && value !== undefined && Number.isFinite(Number(value))) values.set(key, Number(value));
    }
    const nrThrottled = values.get('nr_throttled');
    if (nrThrottled === undefined) return undefined;

    const usec = values.get('throttled_usec') ?? (values.get('throttled_time') ?? 0) / 1000;
    return { nrPeriods: values.get('nr_periods') ?? 0, nrThrottled, throttledUsec: usec };
};

/** The bandwidth limit of a version 2 control group, from `cpu.max`. */
export interface CpuMax {
    /** Microseconds of CPU per period, or undefined for `max`, meaning no limit. */
    readonly quotaUsec: number | undefined;
    readonly periodUsec: number;
}

/**
 * Reads `cpu.max`, whose format is `$MAX $PERIOD` with `max` standing for no limit and the
 * period defaulting to 100000 microseconds.
 */
export const parseCpuMax = (text: string): CpuMax | undefined => {
    const [max, period] = text.trim().split(/\s+/);
    if (max === undefined || max === '') return undefined;
    const periodUsec = period === undefined ? 100_000 : Number(period);
    if (!Number.isFinite(periodUsec)) return undefined;
    if (max === 'max') return { quotaUsec: undefined, periodUsec };
    const quotaUsec = Number(max);

    return Number.isFinite(quotaUsec) ? { quotaUsec, periodUsec } : undefined;
};

/** The version 2 control group of a process, from the `0::$PATH` line of `/proc/$PID/cgroup`. */
export const cgroupV2PathOf = (procCgroup: string): string | undefined => {
    const line = procCgroup.split('\n').find((entry) => entry.startsWith('0::'));
    return line === undefined ? undefined : line.slice(3).replace(/ \(deleted\)$/, '');
};

/** Where throttle counters can be read from. Injectable so a test needs no cgroup. */
export interface CgroupFiles {
    read(path: string): string | undefined;
}

const readFromDisk: CgroupFiles = {
    read: (path) => {
        try {
            return readFileSync(path, 'utf8');
        } catch {
            return undefined;
        }
    }
};

/**
 * Samples this process's control group throttle counter.
 *
 * Finds `cpu.stat` once: the version 2 file under the process's own group, then the version 1
 * `cpu` controller's file. Anywhere else, including macOS and Windows, there is nothing to read
 * and every sample is undefined, which the governor treats as no information.
 */
export class CgroupThrottleSampler {
    private readonly statPath: string | undefined;
    private previous: number | undefined;

    public constructor(files: CgroupFiles = readFromDisk, root = '/sys/fs/cgroup') {
        const own = cgroupV2PathOf(files.read('/proc/self/cgroup') ?? '');
        const candidates = [
            ...(own === undefined ? [] : [`${root}${own === '/' ? '' : own}/cpu.stat`]),
            `${root}/cpu.stat`,
            `${root}/cpu/cpu.stat`,
            `${root}/cpu,cpuacct/cpu.stat`
        ];
        this.statPath = candidates.find((path) => {
            const text = files.read(path);
            return text !== undefined && parseCpuStat(text) !== undefined;
        });
        this.files = files;
    }

    private readonly files: CgroupFiles;

    /** Whether a throttle counter was found. */
    public get available(): boolean {
        return this.statPath !== undefined;
    }

    /**
     * @returns How many times the group was throttled since the previous sample, 0 on the first,
     * or undefined when there is no counter to read.
     */
    public sample(): number | undefined {
        if (this.statPath === undefined) return undefined;
        const text = this.files.read(this.statPath);
        const stat = text === undefined ? undefined : parseCpuStat(text);
        if (stat === undefined) return undefined;

        const delta = this.previous === undefined ? 0 : Math.max(0, stat.nrThrottled - this.previous);
        this.previous = stat.nrThrottled;
        return delta;
    }
}
