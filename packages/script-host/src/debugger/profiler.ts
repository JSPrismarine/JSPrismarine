/**
 * The script profiler the extension's `startProfiler` and `stopProfiler` messages drive. It
 * samples the stack of the debugged pack at each of the debugger's polls, which come every
 * `pollLines` lines a script runs, and hands back a V8 `.cpuprofile`, the format the pinned
 * Bedrock Dedicated Server (BDS) sends in its `ProfilerCapture` event and VS Code opens.
 *
 * The samples count lines rather than time: a script that runs fewer lines than the poll interval
 * between two ticks is never sampled. The clock only labels the samples, as the format asks.
 */

import type { DebugFrame } from './EngineDebugger';

/** A node of a `.cpuprofile`'s call tree, as V8 and VS Code read it. */
interface ProfileNode {
    readonly id: number;
    readonly callFrame: {
        readonly functionName: string;
        readonly scriptId: string;
        readonly url: string;
        /** Zero-based, as in the Chrome DevTools Protocol. */
        readonly lineNumber: number;
        readonly columnNumber: number;
    };
    hitCount: number;
    readonly children: number[];
}

/** A finished profile: the `.cpuprofile` JSON the extension writes to a file. */
export interface CpuProfile {
    readonly nodes: readonly ProfileNode[];
    readonly startTime: number;
    readonly endTime: number;
    readonly samples: readonly number[];
    readonly timeDeltas: readonly number[];
    /**
     * VS Code's source locations. The extension reads `locations` to map a capture through source
     * maps and fails without it; BDS sends `{ rootPath: '.', locations: [] }`.
     */
    readonly $vscode: { readonly rootPath: string; readonly locations: readonly unknown[] };
}

/** The id of the call tree's root, `(root)`, which every stack hangs from. */
const ROOT = 1;

/** One profile, from `startProfiler` to `stopProfiler`. */
export class ScriptProfiler {
    private readonly clock: () => number;
    private readonly toPath: (file: string) => string;
    private readonly startTime: number;
    private last: number;
    private readonly nodes: ProfileNode[] = [];
    /** The child of each node by its function's key, so a stack seen again reuses its nodes. */
    private readonly childByKey = new Map<string, number>();
    private readonly samples: number[] = [];
    private readonly timeDeltas: number[] = [];

    /**
     * @param clock - The time in microseconds, which labels each sample.
     * @param toPath - Turns an engine file name into the path the extension knows it by.
     */
    public constructor(clock: () => number, toPath: (file: string) => string = (file) => file) {
        this.clock = clock;
        this.toPath = toPath;
        this.startTime = clock();
        this.last = this.startTime;
        this.nodes.push(this.node(ROOT, '(root)', '', 0, 0));
    }

    /** How many stacks the profile holds. */
    public get sampleCount(): number {
        return this.samples.length;
    }

    /**
     * Adds one sample: the stack a poll found, innermost frame first, as
     * {@link EngineDebugger.frames} lists it. A function is one node under each caller, whatever
     * line of it was running.
     */
    public sample(frames: readonly DebugFrame[]): void {
        let parent = ROOT;
        for (let index = frames.length - 1; index >= 0; index--) {
            const frame = frames[index];
            if (frame === undefined) continue;
            const name = frame.name === '' ? '(anonymous)' : frame.name;
            const url = frame.file === '' ? '' : this.toPath(frame.file);
            const key = `${parent}\0${name}\0${url}`;
            let id = this.childByKey.get(key);
            if (id === undefined) {
                id = this.nodes.length + 1;
                this.nodes.push(this.node(id, name, url, frame.line - 1, frame.column));
                this.nodes[parent - 1]?.children.push(id);
                this.childByKey.set(key, id);
            }
            parent = id;
        }
        const leaf = this.nodes[parent - 1];
        if (leaf !== undefined) leaf.hitCount++;
        const now = this.clock();
        this.samples.push(parent);
        this.timeDeltas.push(now - this.last);
        this.last = now;
    }

    /** Ends the profile. */
    public finish(): CpuProfile {
        return {
            nodes: this.nodes,
            startTime: this.startTime,
            endTime: this.clock(),
            samples: this.samples,
            timeDeltas: this.timeDeltas,
            $vscode: { rootPath: '.', locations: [] }
        };
    }

    private node(id: number, functionName: string, url: string, lineNumber: number, columnNumber: number): ProfileNode {
        return {
            id,
            callFrame: { functionName, scriptId: url === '' ? '0' : url, url, lineNumber, columnNumber },
            hitCount: 0,
            children: []
        };
    }
}

/** The time in microseconds since the epoch, which BDS's captures use for their start and end. */
export const profilerClock = (): number => Math.round((performance.timeOrigin + performance.now()) * 1000);
