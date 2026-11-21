/**
 * Skips the docs build's two slow steps, TypeDoc and the parity suite, when nothing either reads has
 * changed since it last ran. A change to the site's own pages or theme then rebuilds in the time
 * VitePress takes, rather than first spending minutes on output it would produce unchanged.
 *
 * A step's inputs hash to the git blob IDs of the files it reads, so the same files give the same
 * hash in any checkout. The hash is stored in a stamp beside the step's output. CI caches the output
 * and its stamp under the same hash, so a pull request that leaves the packages alone reuses what a
 * master build produced. Delete a stamp to make its step run again, such as after fetching data the
 * parity suite reported as not measured.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { forceRerunTriggers } from '../../vitest.config.ts';
import { repoRoot } from './project.mts';

interface Step {
    /** Globs, relative to the repository root, matching every file the step reads. */
    readonly inputs: readonly string[];
    /** Where the stamp goes. A step that empties its output directory first deletes its stamp too. */
    readonly stamp: string;
    /** An output file something else can overwrite, so the stamp records its contents as well. */
    readonly output?: string;
}

export const steps = {
    // TypeDoc reads every package through the workspace TypeScript config, with its own config and
    // the plugin versions the lockfile pins.
    api: {
        inputs: [
            'packages/**',
            'package.json',
            'pnpm-lock.yaml',
            'tsconfig*.json',
            'tools/docs/package.json',
            'tools/docs/typedoc.json'
        ],
        stamp: 'tools/docs/site/api/.inputs'
    },
    // The suites read the packages, and Vitest lists the files outside any import graph that they
    // also read. The dashboard can rewrite the tracker by itself, so the stamp hashes it too.
    tracker: {
        inputs: ['packages/**', ...forceRerunTriggers],
        stamp: 'packages/parity/dist/tracker.inputs',
        output: 'packages/parity/dist/tracker.json'
    }
} satisfies Record<string, Step>;

export type StepName = keyof typeof steps;

export function isStepName(name: string | undefined): name is StepName {
    return name !== undefined && Object.hasOwn(steps, name);
}

function git(args: string[], input?: string): string[] {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', input, maxBuffer: 256 * 1024 * 1024 })
        .split(/[\0\n]/)
        .filter(Boolean);
}

/**
 * Hashes the step's input files, as git would store them, including uncommitted edits and new files
 * that git does not ignore.
 */
export function inputHash(name: StepName): string {
    const { inputs } = steps[name];
    const matches = (file: string) => inputs.some((pattern) => path.posix.matchesGlob(file, pattern));
    const blobs = new Map<string, string>();
    for (const line of git(['ls-files', '--stage', '-z'])) {
        const tab = line.indexOf('\t');
        const file = line.slice(tab + 1);
        if (matches(file)) blobs.set(file, line.split(' ')[1] ?? '');
    }
    const changed = git(['ls-files', '-z', '--modified', '--deleted', '--others', '--exclude-standard']).filter(
        matches
    );
    for (const file of changed) blobs.delete(file);
    const present = [...new Set(changed)].filter((file) => existsSync(path.join(repoRoot, file)));
    if (present.length > 0) {
        const ids = git(['hash-object', '--stdin-paths'], `${present.join('\n')}\n`);
        for (const [index, file] of present.entries()) blobs.set(file, ids[index] ?? '');
    }
    const hash = createHash('sha256');
    for (const [file, blob] of [...blobs].sort(([a], [b]) => (a < b ? -1 : 1))) hash.update(`${blob} ${file}\n`);
    return hash.digest('hex');
}

function stampOf(name: StepName, inputs: string): string {
    const step: Step = steps[name];
    if (step.output === undefined) return inputs;
    const output = path.join(repoRoot, step.output);
    const contents = existsSync(output) ? createHash('sha256').update(readFileSync(output)).digest('hex') : '';
    return `${inputs}\n${contents}`;
}

/**
 * Runs a step unless its stamp matches its current inputs, then stamps what it wrote. Returns
 * whether the step ran.
 */
export function runStep(name: StepName, run: () => void): boolean {
    const inputs = inputHash(name);
    const stamp = path.join(repoRoot, steps[name].stamp);
    if (existsSync(stamp) && readFileSync(stamp, 'utf8') === stampOf(name, inputs)) {
        console.error(`Reusing the ${name} output: nothing it reads changed since it was built.`);
        return false;
    }
    run();
    mkdirSync(path.dirname(stamp), { recursive: true });
    writeFileSync(stamp, stampOf(name, inputs));
    return true;
}
