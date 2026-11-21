/**
 * CPU time and resident memory of a process and everything it started.
 *
 * JSPrismarine runs world generation in a child process, so measuring the server's own process
 * alone would leave out most of what a world costs. Each sample walks the tree from the server's
 * process down. On Linux it reads `/proc`, in clock ticks of 10 ms. Elsewhere it reads `ps`, which
 * is enough to develop the harness but leaves out the CPU of children that already exited.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

export interface TreeSample {
    /** User plus system CPU of every process in the tree, including children it already reaped. */
    readonly cpuMs: number;
    readonly rssBytes: number;
    readonly processes: number;
}

interface ProcessStat {
    readonly pid: number;
    readonly ppid: number;
    /** utime + stime + cutime + cstime, in milliseconds. */
    readonly cpuMs: number;
    readonly rssBytes: number;
}

const getconf = (name: string, fallback: number): number => {
    try {
        const value = Number(execFileSync('getconf', [name], { encoding: 'utf8' }).trim());
        return Number.isFinite(value) && value > 0 ? value : fallback;
    } catch {
        return fallback;
    }
};

/**
 * Every process `/proc` lists. A process's own time plus the time of the children it reaped
 * counts each CPU tick once over a live tree: a child's time moves into its parent's `cutime`
 * only when the child is gone.
 */
const linuxProcesses = (() => {
    let ticksPerSecond: number | undefined;
    let pageBytes: number | undefined;
    return (): ProcessStat[] => {
        ticksPerSecond ??= getconf('CLK_TCK', 100);
        pageBytes ??= getconf('PAGESIZE', 4096);
        const stats: ProcessStat[] = [];
        for (const entry of readdirSync('/proc')) {
            if (!/^\d+$/.test(entry)) continue;
            let text: string;
            try {
                text = readFileSync(`/proc/${entry}/stat`, 'utf8');
            } catch {
                continue; // exited between the listing and the read
            }
            // The command name sits in parentheses and may hold spaces, so fields count from after it.
            const fields = text.slice(text.lastIndexOf(')') + 2).split(' ');
            const ticks = [11, 12, 13, 14].reduce((sum, index) => sum + Number(fields[index] ?? 0), 0);
            stats.push({
                pid: Number(entry),
                ppid: Number(fields[1]),
                cpuMs: (ticks * 1000) / ticksPerSecond,
                rssBytes: Number(fields[21] ?? 0) * pageBytes
            });
        }
        return stats;
    };
})();

/** `ps -o time` in `[[dd-]hh:]mm:ss[.cc]`, as macOS and procps print it, in milliseconds. */
export const parsePsTime = (value: string): number => {
    const [days, rest] = value.includes('-') ? value.split('-') : ['0', value];
    const parts = (rest ?? '').split(':').map(Number);
    const seconds = parts.reduce((total, part) => total * 60 + part, 0);
    return Math.round((Number(days) * 86_400 + seconds) * 1000);
};

const psProcesses = (): ProcessStat[] =>
    execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss=,time='], { encoding: 'utf8' })
        .split('\n')
        .map((line) => line.trim().split(/\s+/))
        .filter((fields) => fields.length === 4)
        .map(([pid, ppid, rss, time]) => ({
            pid: Number(pid),
            ppid: Number(ppid),
            cpuMs: parsePsTime(time!),
            rssBytes: Number(rss) * 1024
        }));

/** Sums the processes descended from `root`, `root` included. */
export const sumTree = (root: number, processes: readonly ProcessStat[]): TreeSample => {
    const children = new Map<number, ProcessStat[]>();
    const byPid = new Map<number, ProcessStat>();
    for (const process of processes) {
        byPid.set(process.pid, process);
        const siblings = children.get(process.ppid) ?? [];
        siblings.push(process);
        children.set(process.ppid, siblings);
    }
    let cpuMs = 0;
    let rssBytes = 0;
    let count = 0;
    const pending = byPid.has(root) ? [byPid.get(root)!] : [];
    while (pending.length > 0) {
        const process = pending.pop()!;
        cpuMs += process.cpuMs;
        rssBytes += process.rssBytes;
        count++;
        pending.push(...(children.get(process.pid) ?? []));
    }
    return { cpuMs, rssBytes, processes: count };
};

/** Whether CPU samples include children that already exited, as `/proc` does and `ps` does not. */
export const countsReapedChildren = process.platform === 'linux';

/** One sample of the tree under `root`. A tree that is gone reads as zero processes. */
export const sampleTree = (root: number): TreeSample =>
    sumTree(root, process.platform === 'linux' ? linuxProcesses() : psProcesses());

/**
 * Samples a tree four times a second for its peak memory, and on demand for CPU at a phase
 * boundary. The CPU figure only grows: a sample taken after the tree is gone repeats the last one.
 */
export class TreeMonitor {
    private timer: NodeJS.Timeout | undefined;
    private last: TreeSample = { cpuMs: 0, rssBytes: 0, processes: 0 };
    public peakRssBytes = 0;
    public peakProcesses = 0;
    private readonly root: number;

    public constructor(root: number) {
        this.root = root;
    }

    public start(intervalMs = 250): void {
        this.sample();
        this.timer = setInterval(() => this.sample(), intervalMs);
        this.timer.unref();
    }

    public stop(): void {
        clearInterval(this.timer);
        this.timer = undefined;
    }

    public sample(): TreeSample {
        const sample = sampleTree(this.root);
        if (sample.processes > 0) {
            this.last = { ...sample, cpuMs: Math.max(sample.cpuMs, this.last.cpuMs) };
            this.peakRssBytes = Math.max(this.peakRssBytes, sample.rssBytes);
            this.peakProcesses = Math.max(this.peakProcesses, sample.processes);
        }
        return this.last;
    }
}
