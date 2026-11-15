#!/usr/bin/env node
/**
 * Reads V8 `.cpuprofile` files and the capture directories `profile.mjs` writes, and reports
 * where the sampled CPU time went. Every share here comes from wall-clock sampling, so it is
 * indicative: compare captures from the same host at similar load, and treat the counts in a
 * capture's `meta.json` as the stronger evidence.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const SCRIPT = 'node .agents/skills/chrome-devtools/analyze.mjs';
const DEFAULT_CATEGORIES = join(dirname(fileURLToPath(import.meta.url)), 'categories.json');

const HELP = `Usage: ${SCRIPT} <command> <profile> [options]

<profile> is a .cpuprofile file or a capture directory from profile.mjs, which reads its
main.cpuprofile (or, with --thread workers, every worker-N.cpuprofile merged). stretches follows
one thread's timeline, so with several worker profiles it needs one worker-N.cpuprofile file.

Commands:
  summary <profile>              Busy, idle and GC shares, then the top functions by self and
                                 inclusive time. --top N (40), --filter <regex>
  functions <profile>            One ranked list of functions. --by self|inclusive (inclusive),
                                 --top N (40), --filter <regex>
  stretches <profile>            Busy stretches (runs of samples with no idle between them) of
                                 at least --min-ms (25), the frames inside them, and the --show N
                                 (5) longest with --frames M (9) frames each. --show 1 --frames 30
                                 reads the single longest stall.
  subtree <profile> <regex>      Self time inside the subtree of frames matching the regex,
                                 by function. --top N (30)
  callers <profile> <regex>      Caller chains, --depth N (3) frames up, of samples whose leaf
                                 frame matches. --top N (15)
  stacks <profile> <regex>       Heaviest stacks through a matching frame, --depth N (14) frames
                                 toward the root. --top N (8)
  categories <profile>           Busy time by category (first matching pattern on the stack).
                                 --categories <file> (categories.json), --min-ms N (0) counts only
                                 stretches at least that long.
  compare <a> <b>                Two captures side by side: overview, meta.json counts, categories
                                 and functions with the change in percentage points.
                                 --by self|inclusive (self), --top N (30), --sort share|delta,
                                 --filter <regex>, --categories <file>, --min-ms N (0)

Common options:
  --thread main|workers          Which profiles of a capture directory to read (main).
  --lines                        Keep line numbers in function keys. Off by default for compare,
                                 since an edit moves the lines of everything below it.

Frames read as "<function> <package>/<path>:<line>"; regexes match that text. Idle is V8's
(idle) frame plus piscina's atomicsWaitLoop, where a worker waits for its next task. Each sample
counts for the time since the previous one. Shares are percentages of all sampled time, idle
included, unless a heading says otherwise.
`;

const INDICATIVE =
    'Indicative only: these shares come from wall-clock CPU sampling. Load and the host change them; ' +
    'compare captures taken on one host at similar load, and lead with the counts.';

/**
 * Leaf frames that mean the thread is waiting: V8's own idle marker, and the loop a piscina
 * worker blocks in between tasks.
 */
const IDLE_FRAMES = /^\(idle\)$|^atomicsWaitLoop /;

/** A time delta at least this long, in microseconds, counts as a gap in sampling. */
const GAP_US = 10_000;

/** The event-loop frames every stack passes through, which say nothing about the work. */
const LOOP_FRAMES =
    /^\(root\)|^processTimers |^listOnTimeout |^processImmediate |^runMicrotasks|^processTicksAndRejections /;

/**
 * A frame as one line: function name, then the file relative to its workspace package or the
 * pnpm package it came from, then the one-based line.
 */
export const frameLabel = (callFrame, { lines = true } = {}) => {
    const name = callFrame.functionName || '(anonymous)';
    let url = callFrame.url.replace(/^file:\/\//, '');
    const dependency = /\/node_modules\/\.pnpm\/([^/]+)\//.exec(url);
    if (dependency) return `${name} ${dependency[1]}`;
    const workspace = /\/packages\/([^/]+)\/(?:dist|src)\/(.*)$/.exec(url);
    if (workspace) url = `${workspace[1]}/${workspace[2]}`;
    if (!url) return name;
    return lines ? `${name} ${url}:${callFrame.lineNumber + 1}` : `${name} ${url}`;
};

/** The profile files a path names: the file itself, or the chosen thread's files in a capture directory. */
export const profileFiles = (path, thread = 'main') => {
    if (!statSync(path).isDirectory()) return [path];
    if (thread === 'main') {
        const main = join(path, 'main.cpuprofile');
        if (!existsSync(main)) throw new Error(`${path} has no main.cpuprofile`);
        return [main];
    }
    const workers = readdirSync(path)
        .filter((name) => /^worker-\d+\.cpuprofile$/.test(name))
        .sort((left, right) => Number(left.match(/\d+/)[0]) - Number(right.match(/\d+/)[0]))
        .map((name) => join(path, name));
    if (workers.length === 0) throw new Error(`${path} has no worker-N.cpuprofile files; capture with --workers`);
    return workers;
};

/** A capture directory's meta.json, or undefined for a bare profile file. */
export const readMeta = (path) => {
    const file = join(path, 'meta.json');
    return statSync(path).isDirectory() && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
};

/** Adds `count` to `key` in a map of counts. */
const add = (map, key, count) => map.set(key, (map.get(key) ?? 0) + count);

/**
 * Parses a profile and indexes its nodes, labels and per-node sampled time. `counts` and the
 * totals are microseconds, each sample weighted by its time delta.
 */
export const readProfile = (file, { lines = true } = {}) => {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(raw.nodes) || !Array.isArray(raw.samples)) throw new Error(`${file} is not a .cpuprofile`);
    const parent = new Map();
    for (const node of raw.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
    const label = new Map(raw.nodes.map((node) => [node.id, frameLabel(node.callFrame, { lines })]));
    const idle = new Set(raw.nodes.filter((node) => IDLE_FRAMES.test(label.get(node.id))).map((node) => node.id));

    const stacks = new Map();
    /** Labels from the leaf to the outermost frame below `(root)`. */
    const stack = (id) => {
        let frames = stacks.get(id);
        if (frames) return frames;
        frames = [];
        for (let current = id; current !== undefined; current = parent.get(current)) frames.push(label.get(current));
        if (frames.at(-1) === '(root)') frames.pop();
        stacks.set(id, frames);
        return frames;
    };

    // Each sample stands for the time since the previous one, so a gap in sampling counts
    // toward the stack seen at its end.
    const weights = Float64Array.from(raw.samples, (_, index) => Math.max(0, raw.timeDeltas?.[index] ?? 0));

    const counts = new Map();
    raw.samples.forEach((id, index) => add(counts, id, weights[index]));
    let total = 0;
    for (const weight of counts.values()) total += weight;
    let idleUs = 0;
    for (const id of idle) idleUs += counts.get(id) ?? 0;
    // A delta far past the sampling interval means the sampler did not run: the thread was
    // descheduled, stopped in native code, or the host was saturated.
    const gaps = weights.filter((weight) => weight >= GAP_US);

    return {
        file,
        raw,
        label,
        stack,
        counts,
        weights,
        isIdle: (id) => idle.has(id),
        samples: raw.samples.length,
        total,
        idle: idleUs,
        gaps: { count: gaps.length, us: gaps.reduce((sum, weight) => sum + weight, 0) },
        spanMs: (raw.endTime - raw.startTime) / 1000
    };
};

/**
 * Several profiles read as one for reports that add up sampled time: node IDs become
 * `<profile index>:<node ID>`, and samples, totals and gaps are summed. The span is the longest
 * profile's, since worker threads sample side by side. The result has no `raw` or `weights`,
 * because the profiles' timelines do not interleave into one.
 */
export const mergeProfiles = (profiles) => {
    if (profiles.length === 1) return profiles[0];
    const owners = new Map();
    const counts = new Map();
    const label = new Map();
    profiles.forEach((profile, index) => {
        for (const [id, count] of profile.counts) {
            const key = `${index}:${id}`;
            owners.set(key, [profile, id]);
            counts.set(key, count);
            label.set(key, profile.label.get(id));
        }
    });
    const sum = (read) => profiles.reduce((total, profile) => total + read(profile), 0);
    return {
        file: profiles.map((profile) => profile.file).join(', '),
        profiles: profiles.length,
        label,
        counts,
        stack: (key) => {
            const [profile, id] = owners.get(key);
            return profile.stack(id);
        },
        isIdle: (key) => {
            const [profile, id] = owners.get(key);
            return profile.isIdle(id);
        },
        samples: sum((profile) => profile.samples),
        total: sum((profile) => profile.total),
        idle: sum((profile) => profile.idle),
        gaps: { count: sum((profile) => profile.gaps.count), us: sum((profile) => profile.gaps.us) },
        spanMs: profiles.reduce((longest, profile) => Math.max(longest, profile.spanMs), 0)
    };
};

/** Sampled time with each function as the leaf frame. */
export const selfCounts = (profile) => {
    const result = new Map();
    for (const [id, count] of profile.counts) add(result, profile.label.get(id), count);
    return result;
};

/** Sampled time with each function anywhere on the stack, counted once per sample however often it recurses. */
export const inclusiveCounts = (profile) => {
    const result = new Map();
    for (const [id, count] of profile.counts) for (const frame of new Set(profile.stack(id))) add(result, frame, count);
    return result;
};

/** Runs of consecutive non-idle samples, each with its duration and its sample indexes. */
export const busyStretches = (profile) => {
    const { samples } = profile.raw;
    const stretches = [];
    let current;
    for (let index = 0; index < samples.length; index++) {
        if (profile.isIdle(samples[index])) {
            if (current) stretches.push(current);
            current = undefined;
            continue;
        }
        current ??= { us: 0, indexes: [] };
        current.us += profile.weights[index];
        current.indexes.push(index);
    }
    if (current) stretches.push(current);
    return stretches;
};

/** Reads a categories file: `{ "categories": [[name, pattern], ...] }`. */
export const readCategories = (file = DEFAULT_CATEGORIES) =>
    JSON.parse(readFileSync(file, 'utf8')).categories.map(([name, pattern]) => [name, new RegExp(pattern)]);

/** A function from node ID to the first category whose pattern matches a frame on its stack. */
export const categorizer = (profile, categories) => {
    const memo = new Map();
    return (id) => {
        let category = memo.get(id);
        if (category === undefined) {
            const frames = profile.stack(id);
            category = categories.find(([, pattern]) => frames.some((frame) => pattern.test(frame)))?.[0] ?? 'other';
            memo.set(id, category);
        }
        return category;
    };
};

/** Busy time by category; with `minMs`, only the time inside stretches at least that long. */
export const categoryCounts = (profile, categories, minMs = 0) => {
    const categoryOf = categorizer(profile, categories);
    const result = new Map();
    if (minMs <= 0) {
        for (const [id, count] of profile.counts) if (!profile.isIdle(id)) add(result, categoryOf(id), count);
        return result;
    }
    for (const stretch of busyStretches(profile)) {
        if (stretch.us < minMs * 1000) continue;
        for (const index of stretch.indexes)
            add(result, categoryOf(profile.raw.samples[index]), profile.weights[index]);
    }
    return result;
};

const percent = (part, whole, digits = 1) => (whole === 0 ? 0 : (100 * part) / whole).toFixed(digits);

const ranked = (map, { top, filter } = {}) =>
    [...map]
        .filter(([key]) => !filter || filter.test(key))
        .sort((left, right) => right[1] - left[1])
        .slice(0, top);

const printRanked = (map, total, options) => {
    for (const [key, count] of ranked(map, options)) console.log(`${percent(count, total).padStart(5)}%  ${key}`);
};

const overviewLine = (profile) => {
    const self = selfCounts(profile);
    const shares = ['(idle)', '(program)', '(garbage collector)']
        .map((name) => `${name} ${percent(self.get(name) ?? 0, profile.total)}%`)
        .join('  ');
    const merged = profile.profiles > 1 ? `${profile.profiles} profiles merged, ` : '';
    return (
        `${merged}${profile.samples} samples over ${(profile.spanMs / 1000).toFixed(1)} s, busy ${percent(profile.total - profile.idle, profile.total)}%  ${shares}\n` +
        `sampling gaps >= ${GAP_US / 1000} ms: ${profile.gaps.count}, ${(profile.gaps.us / 1000).toFixed(0)} ms in total`
    );
};

const summary = (profile, { top, filter }) => {
    console.log(overviewLine(profile));
    console.log('\nSELF');
    printRanked(selfCounts(profile), profile.total, { top, filter });
    console.log('\nINCLUSIVE');
    printRanked(inclusiveCounts(profile), profile.total, { top, filter });
};

const stretchesReport = (profile, { minMs, top, show, frames }) => {
    const all = busyStretches(profile);
    const long = all.filter((stretch) => stretch.us >= minMs * 1000);
    const busyUs = long.reduce((sum, stretch) => sum + stretch.us, 0);
    console.log(
        `stretches >= ${minMs} ms: ${long.length} of ${all.length}, ${(busyUs / 1e6).toFixed(1)} s busy in them over a ${(profile.spanMs / 1000).toFixed(1)} s span`
    );
    const longest = [...long].sort((left, right) => right.us - left.us);
    console.log(
        `longest (ms): ${longest
            .slice(0, 12)
            .map((stretch) => Math.round(stretch.us / 1000))
            .join(' ')}`
    );

    /** Inclusive time per frame across the given stretches. */
    const framesIn = (selected) => {
        const result = new Map();
        for (const stretch of selected) {
            for (const index of stretch.indexes) {
                const weight = profile.weights[index];
                for (const frame of new Set(profile.stack(profile.raw.samples[index]))) add(result, frame, weight);
            }
        }
        return result;
    };
    console.log(`\nFrames inside those stretches (% of their time, inclusive)`);
    printRanked(framesIn(long), busyUs, { top, filter: undefined });

    for (const stretch of longest.slice(0, show)) {
        console.log(`\n-- ${Math.round(stretch.us / 1000)} ms`);
        for (const [frame, us] of ranked(framesIn([stretch]))
            .filter(([frame]) => !LOOP_FRAMES.test(frame))
            .slice(0, frames)) {
            console.log(`${percent(us, stretch.us, 0).padStart(4)}%  ${frame}`);
        }
    }
};

const subtree = (profile, pattern, { top }) => {
    const self = new Map();
    let inside = 0;
    for (const [id, count] of profile.counts) {
        if (!profile.stack(id).some((frame) => pattern.test(frame))) continue;
        inside += count;
        add(self, profile.label.get(id), count);
    }
    console.log(`subtree: ${percent(inside, profile.total)}% of sampled time`);
    for (const [frame, count] of ranked(self, { top })) {
        console.log(`${percent(count, profile.total, 2).padStart(6)}%  ${frame}`);
    }
};

const callers = (profile, pattern, { depth, top }) => {
    const chains = new Map();
    for (const [id, count] of profile.counts) {
        if (!pattern.test(profile.label.get(id))) continue;
        add(
            chains,
            profile
                .stack(id)
                .slice(1, 1 + depth)
                .join(' < '),
            count
        );
    }
    for (const [chain, count] of ranked(chains, { top })) {
        console.log(`${percent(count, profile.total, 2).padStart(6)}%  ${chain}`);
    }
};

const stacks = (profile, pattern, { depth, top }) => {
    const found = new Map();
    for (const [id, count] of profile.counts) {
        const frames = profile.stack(id);
        const index = frames.findIndex((frame) => pattern.test(frame));
        if (index >= 0) add(found, frames.slice(index, index + depth).join(' < '), count);
    }
    for (const [chain, count] of ranked(found, { top })) {
        console.log(`${percent(count, profile.total, 2)}%  ${chain}\n`);
    }
};

/** Busy time by category, added up across the profiles. */
const categoriesReport = (profiles, categories, minMs) => {
    const counts = new Map();
    for (const profile of profiles) {
        for (const [name, count] of categoryCounts(profile, categories, minMs)) add(counts, name, count);
    }
    const sum = [...counts.values()].reduce((total, count) => total + count, 0);
    console.log(minMs > 0 ? `Busy time in stretches >= ${minMs} ms, by category` : 'Busy time by category');
    for (const [name, count] of ranked(counts)) {
        console.log(
            `${name.padEnd(18)} ${(count / 1000).toFixed(0).padStart(7)} ms  ${percent(count, sum).padStart(5)}%`
        );
    }
};

/** Everything compare needs from one side, with worker profiles merged by adding their counts. */
const side = (path, { thread, lines, categories, minMs }) => {
    const profiles = profileFiles(path, thread).map((file) => readProfile(file, { lines }));
    const merged = {
        samples: 0,
        total: 0,
        idle: 0,
        busy: 0,
        gaps: 0,
        gapMs: 0,
        self: new Map(),
        inclusive: new Map(),
        categories: new Map()
    };
    for (const profile of profiles) {
        merged.samples += profile.samples;
        merged.total += profile.total;
        merged.idle += profile.idle;
        merged.gaps += profile.gaps.count;
        merged.gapMs += profile.gaps.us / 1000;
        for (const [key, count] of selfCounts(profile)) add(merged.self, key, count);
        for (const [key, count] of inclusiveCounts(profile)) add(merged.inclusive, key, count);
        for (const [key, count] of categoryCounts(profile, categories, minMs)) add(merged.categories, key, count);
    }
    merged.busy = merged.total - merged.idle;
    if (profiles.length === 1) {
        const [profile] = profiles;
        const stretches = busyStretches(profile);
        merged.spanS = profile.spanMs / 1000;
        merged.stretches25 = stretches.filter((stretch) => stretch.us >= 25_000).length;
        merged.stretches50 = stretches.filter((stretch) => stretch.us >= 50_000).length;
        merged.longestMs = Math.round(stretches.reduce((longest, stretch) => Math.max(longest, stretch.us), 0) / 1000);
    }
    merged.profiles = profiles.length;
    merged.meta = readMeta(path);
    merged.name = merged.meta?.name ?? path;
    return merged;
};

const row = (label, left, right, digits = 1) => {
    const format = (value) =>
        value === undefined || value === null ? '-' : typeof value === 'number' ? value.toFixed(digits) : String(value);
    const delta = typeof left === 'number' && typeof right === 'number' ? right - left : undefined;
    const sign = delta === undefined ? '' : delta > 0 ? '+' : '';
    console.log(
        `${label.padEnd(34)} ${format(left).padStart(12)} ${format(right).padStart(12)} ${delta === undefined ? '' : `${sign}${delta.toFixed(digits)}`.padStart(9)}`
    );
};

const sumTasks = (meta, field) =>
    meta?.counts?.generation?.reduce((total, entry) => total + (entry[field] ?? 0), 0) ?? undefined;

const compare = (leftPath, rightPath, options) => {
    const left = side(leftPath, options);
    const right = side(rightPath, options);
    const pct = (part, whole) => (whole === 0 ? 0 : (100 * part) / whole);

    console.log(INDICATIVE);
    console.log(`\nA: ${left.name}\nB: ${right.name}`);
    for (const [name, data] of [
        ['A', left],
        ['B', right]
    ]) {
        const meta = data.meta;
        if (!meta) continue;
        const load = (at) => meta.load?.[at]?.map((value) => value.toFixed(2)).join(' ') ?? '?';
        console.log(
            `${name}: ${meta.git?.sha?.slice(0, 12) ?? '?'}${meta.git?.dirty ? ' (dirty)' : ''}, load ${load('before')} -> ${load('after')}, ${meta.host?.cpus ?? '?'} CPUs, ${meta.workload?.description ?? ''}`
        );
    }
    if (left.meta && right.meta && left.meta.workload?.description !== right.meta.workload?.description) {
        console.log('WARNING: the captures ran different workloads, so their numbers do not compare.');
    }
    const settings = (meta) => JSON.stringify(meta?.server?.effective);
    if (left.meta && right.meta && settings(left.meta) !== settings(right.meta)) {
        console.log(
            `WARNING: the servers ran with different settings, so their numbers do not compare.\n  A: ${settings(left.meta)}\n  B: ${settings(right.meta)}`
        );
    }

    console.log(`\n${'Overview'.padEnd(34)} ${'A'.padStart(12)} ${'B'.padStart(12)} ${'B-A'.padStart(9)}`);
    row('profiles merged', left.profiles, right.profiles, 0);
    row('samples', left.samples, right.samples, 0);
    row('span s', left.spanS, right.spanS);
    row('busy % of sampled time', pct(left.busy, left.total), pct(right.busy, right.total));
    row(
        'gc % of sampled time',
        pct(left.self.get('(garbage collector)') ?? 0, left.total),
        pct(right.self.get('(garbage collector)') ?? 0, right.total)
    );
    row(`sampling gaps >= ${GAP_US / 1000} ms`, left.gaps, right.gaps, 0);
    row('time in sampling gaps ms', left.gapMs, right.gapMs, 0);
    row('busy stretches >= 25 ms', left.stretches25, right.stretches25, 0);
    row('busy stretches >= 50 ms', left.stretches50, right.stretches50, 0);
    row('longest busy stretch ms', left.longestMs, right.longestMs, 0);

    if (left.meta?.counts || right.meta?.counts) {
        console.log(
            `\n${'Counts (meta.json)'.padEnd(34)} ${'A'.padStart(12)} ${'B'.padStart(12)} ${'B-A'.padStart(9)}`
        );
        const counts = (meta) => meta?.counts ?? {};
        row('server ticks during the workload', counts(left.meta).ticks, counts(right.meta).ticks, 0);
        row('ticks over the tick period', left.meta?.ticks?.overruns, right.meta?.ticks?.overruns, 0);
        row('chunks loaded at the end', counts(left.meta).loadedChunks, counts(right.meta).loadedChunks, 0);
        row('generation tasks settled', sumTasks(left.meta, 'tasks'), sumTasks(right.meta, 'tasks'), 0);
        row('generation tasks failed', sumTasks(left.meta, 'failed'), sumTasks(right.meta, 'failed'), 0);
        row('main thread CPU ms', left.meta?.thread?.cpuMs, right.meta?.thread?.cpuMs, 0);
        row('event loop active ms', left.meta?.thread?.eventLoopActiveMs, right.meta?.thread?.eventLoopActiveMs, 0);
    }

    const busyLabel = options.minMs > 0 ? `stretches >= ${options.minMs} ms` : 'busy time';
    console.log(
        `\n${`Categories, % of ${busyLabel}`.padEnd(34)} ${'A'.padStart(12)} ${'B'.padStart(12)} ${'B-A'.padStart(9)}`
    );
    const sum = (map) => [...map.values()].reduce((total, count) => total + count, 0);
    const leftSum = sum(left.categories);
    const rightSum = sum(right.categories);
    const categoryNames = new Set([...left.categories.keys(), ...right.categories.keys()]);
    for (const name of [...categoryNames].sort(
        (a, b) =>
            Math.max(pct(right.categories.get(b) ?? 0, rightSum), pct(left.categories.get(b) ?? 0, leftSum)) -
            Math.max(pct(right.categories.get(a) ?? 0, rightSum), pct(left.categories.get(a) ?? 0, leftSum))
    )) {
        row(name, pct(left.categories.get(name) ?? 0, leftSum), pct(right.categories.get(name) ?? 0, rightSum));
    }

    const key = options.by === 'inclusive' ? 'inclusive' : 'self';
    const names = new Set([...left[key].keys(), ...right[key].keys()]);
    const shares = [...names]
        .filter((name) => !options.filter || options.filter.test(name))
        .map((name) => ({
            name,
            a: pct(left[key].get(name) ?? 0, left.total),
            b: pct(right[key].get(name) ?? 0, right.total)
        }));
    shares.sort((x, y) =>
        options.sort === 'delta' ? Math.abs(y.b - y.a) - Math.abs(x.b - x.a) : Math.max(y.a, y.b) - Math.max(x.a, x.b)
    );
    console.log(`\nFunctions, ${key} % of all sampled time    A       B     B-A`);
    for (const { name, a, b } of shares.slice(0, options.top)) {
        const delta = b - a;
        console.log(
            `${a.toFixed(2).padStart(6)}  ${b.toFixed(2).padStart(6)}  ${`${delta > 0 ? '+' : ''}${delta.toFixed(2)}`.padStart(6)}  ${name}`
        );
    }
};

const positiveInteger = (value, flag) => {
    if (!/^\d+$/.test(value)) throw new Error(`${flag} needs a whole number, got ${value}`);
    return Number(value);
};

const main = () => {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            top: { type: 'string' },
            filter: { type: 'string' },
            by: { type: 'string' },
            'min-ms': { type: 'string' },
            show: { type: 'string' },
            frames: { type: 'string' },
            depth: { type: 'string' },
            categories: { type: 'string' },
            thread: { type: 'string', default: 'main' },
            sort: { type: 'string', default: 'share' },
            lines: { type: 'boolean' },
            help: { type: 'boolean', short: 'h' }
        }
    });
    const [command, ...args] = positionals;
    if (values.help || !command || command === 'help') {
        process.stdout.write(HELP);
        return;
    }
    if (!['main', 'workers'].includes(values.thread)) throw new Error('--thread is main or workers');
    const number = (flag, fallback) =>
        values[flag] === undefined ? fallback : positiveInteger(values[flag], `--${flag}`);
    const filter = values.filter === undefined ? undefined : new RegExp(values.filter);
    const needs = (count, usage) => {
        if (args.length !== count) throw new Error(`usage: ${SCRIPT} ${command} ${usage}`);
    };
    const profiles = () =>
        profileFiles(args[0], values.thread).map((file) => readProfile(file, { lines: values.lines ?? true }));
    /** The profile for reports that add up sampled time: worker profiles merge into one. */
    const merged = () => mergeProfiles(profiles());
    /** The profile for a report that follows one thread's timeline. */
    const timeline = () => {
        const files = profileFiles(args[0], values.thread);
        if (files.length > 1) {
            throw new Error(`${command} follows one thread's timeline; pass one profile file, such as ${files[0]}`);
        }
        return readProfile(files[0], { lines: values.lines ?? true });
    };

    switch (command) {
        case 'summary':
            needs(1, '<profile>');
            summary(merged(), { top: number('top', 40), filter });
            break;
        case 'functions': {
            needs(1, '<profile>');
            const profile = merged();
            const counts = values.by === 'self' ? selfCounts(profile) : inclusiveCounts(profile);
            printRanked(counts, profile.total, { top: number('top', 40), filter });
            break;
        }
        case 'stretches':
            needs(1, '<profile>');
            stretchesReport(timeline(), {
                minMs: number('min-ms', 25),
                top: number('top', 15),
                show: number('show', 5),
                frames: number('frames', 9)
            });
            break;
        case 'subtree':
            needs(2, '<profile> <regex>');
            subtree(merged(), new RegExp(args[1]), { top: number('top', 30) });
            break;
        case 'callers':
            needs(2, '<profile> <regex>');
            callers(merged(), new RegExp(args[1]), { depth: number('depth', 3), top: number('top', 15) });
            break;
        case 'stacks':
            needs(2, '<profile> <regex>');
            stacks(merged(), new RegExp(args[1]), { depth: number('depth', 14), top: number('top', 8) });
            break;
        case 'categories':
            needs(1, '<profile>');
            categoriesReport(profiles(), readCategories(values.categories), number('min-ms', 0));
            break;
        case 'compare':
            needs(2, '<a> <b>');
            if (!['share', 'delta'].includes(values.sort)) throw new Error('--sort is share or delta');
            compare(args[0], args[1], {
                thread: values.thread,
                lines: values.lines ?? false,
                categories: readCategories(values.categories),
                minMs: number('min-ms', 0),
                by: values.by ?? 'self',
                top: number('top', 30),
                sort: values.sort,
                filter
            });
            break;
        default:
            throw new Error(`Unknown command: ${command}\n\n${HELP}`);
    }
};

if (import.meta.main) {
    try {
        main();
    } catch (error) {
        console.error(`analyze: ${error.message}`);
        process.exitCode = 1;
    }
}
