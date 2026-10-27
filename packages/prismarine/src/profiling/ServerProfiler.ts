import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { threadId } from 'node:worker_threads';
import { withCwd } from '../utils/cwd';

type CompleteEvent = {
    cat: 'jsprismarine';
    dur: number;
    name: string;
    ph: 'X';
    pid: number;
    tid: number;
    ts: number;
};

type CounterEvent = {
    args: Record<string, number>;
    cat: 'jsprismarine';
    name: string;
    ph: 'C';
    pid: number;
    tid: number;
    ts: number;
};

type MetadataEvent = {
    args: Record<string, string>;
    cat: 'jsprismarine';
    name: string;
    ph: 'M';
    pid: number;
    tid: number;
    ts: number;
};

type TraceEvent = CompleteEvent | CounterEvent | MetadataEvent;

const MAX_TRACE_EVENTS = 200_000;
const NOOP = (): void => {};
const profilers = new WeakMap<object, ServerProfiler>();

/** Connects an opt-in profiler to an owner whose code records spans. */
export const attachProfiler = (owner: object, profiler: ServerProfiler): void => {
    profilers.set(owner, profiler);
};

/** Starts a trace span when the owner has profiling enabled; otherwise returns a shared no-op. */
export const startProfileSpan = (owner: object, name: string): (() => void) =>
    profilers.get(owner)?.start(name) ?? NOOP;

/** Records bounded Chrome Trace Event data for one opt-in server run. */
export class ServerProfiler {
    private readonly events: TraceEvent[] = [];
    private readonly eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
    private readonly sampleTimer: NodeJS.Timeout;
    private nextEventIndex = 0;
    private eventCount = 0;

    public constructor() {
        this.eventLoopDelay.enable();
        this.sampleTimer = setInterval(() => this.recordEventLoopDelay(), 1000);
        this.sampleTimer.unref();
    }

    /**
     * Starts a complete-event span, including time spent awaiting asynchronous work.
     * @param name - The server phase shown in the trace viewer.
     * @returns A callback that closes the span once.
     */
    public start(name: string): () => void {
        const startedAt = performance.now();
        let ended = false;

        return () => {
            if (ended) return;
            ended = true;

            const endedAt = performance.now();
            this.append({
                cat: 'jsprismarine',
                dur: Math.max(0, endedAt - startedAt) * 1000,
                name,
                ph: 'X',
                pid: process.pid,
                tid: threadId,
                ts: startedAt * 1000
            });
        };
    }

    /**
     * Writes the captured spans and event-loop delay counters as a Chrome trace file.
     * @returns The saved path, or undefined when the run captured no spans.
     */
    public async save(): Promise<string | undefined> {
        clearInterval(this.sampleTimer);
        this.recordEventLoopDelay();
        this.eventLoopDelay.disable();

        if (this.eventCount === 0) return undefined;

        const file = withCwd('profiles', `jsprismarine-${new Date().toISOString().replaceAll(':', '-')}.trace.json`);
        await mkdir(path.dirname(file), { recursive: true });

        const metadata: MetadataEvent[] = [
            {
                args: { name: 'JSPrismarine' },
                cat: 'jsprismarine',
                name: 'process_name',
                ph: 'M',
                pid: process.pid,
                tid: threadId,
                ts: 0
            }
        ];
        await writeFile(
            file,
            JSON.stringify({ traceEvents: [...metadata, ...this.orderedEvents()], displayTimeUnit: 'ms' })
        );
        return file;
    }

    private append(event: TraceEvent): void {
        this.events[this.nextEventIndex] = event;
        this.nextEventIndex = (this.nextEventIndex + 1) % MAX_TRACE_EVENTS;
        this.eventCount = Math.min(this.eventCount + 1, MAX_TRACE_EVENTS);
    }

    private orderedEvents(): readonly TraceEvent[] {
        if (this.eventCount < MAX_TRACE_EVENTS) return this.events.slice(0, this.eventCount);
        return [...this.events.slice(this.nextEventIndex), ...this.events.slice(0, this.nextEventIndex)];
    }

    private recordEventLoopDelay(): void {
        const args = {
            maxMs: this.eventLoopDelay.max / 1_000_000,
            meanMs: this.eventLoopDelay.mean / 1_000_000,
            p99Ms: this.eventLoopDelay.percentile(99) / 1_000_000
        };

        if (Object.values(args).some(Number.isFinite)) {
            this.append({
                args,
                cat: 'jsprismarine',
                name: 'Event loop delay',
                ph: 'C',
                pid: process.pid,
                tid: threadId,
                ts: performance.now() * 1000
            });
        }

        this.eventLoopDelay.reset();
    }
}
