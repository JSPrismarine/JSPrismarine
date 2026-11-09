/**
 * A Vitest reporter that prints how far a CI run is, so a job's log shows it moving.
 *
 * It prints a line as Vitest starts, then one every time another twentieth of the run's test
 * files finishes: `[shard 2/4] 50% · 150/300 files · 1402 tests passed, 1 failed`. When nothing
 * has printed for 30 seconds it prints the line again with every file a worker has taken and not
 * finished, and whether it is still loading or running, which is where a stalled run shows what it
 * is stuck on.
 *
 * The file total is known when the run starts; a file's tests are counted as it finishes, because
 * Vitest only learns how many a file has once it has collected it.
 */
import { relative } from 'node:path';

import type { Reporter, TestModule, TestSpecification, Vitest } from 'vitest/node';

/** How many steps the run is reported in, a line per step. */
const STEPS = 20;

/** How long the log may go quiet before the reporter says what is still running. */
const HEARTBEAT_MS = 30_000;

export default class ProgressReporter implements Reporter {
    private files = 0;
    private finished = 0;
    private passed = 0;
    private failed = 0;
    private reportedStep = 0;
    private lastPrinted = 0;
    private heartbeat: ReturnType<typeof setInterval> | undefined;
    /** The files a worker has taken and not finished, with how far each has got. */
    private readonly unfinished = new Map<string, 'loading' | 'running'>();
    private vitest: Vitest | undefined;

    /** The shard, `2/4`, as the workflow passes it in `VITEST_SHARD`. */
    private readonly label = process.env.VITEST_SHARD ? `[shard ${process.env.VITEST_SHARD}] ` : '';

    /**
     * Prints the first line as Vitest starts, before it has found a single file, and starts the
     * heartbeat, so the log shows the run from its first moment rather than once collection ends.
     */
    public onInit(vitest: Vitest): void {
        this.vitest = vitest;
        this.print('Starting');

        this.heartbeat = setInterval(() => {
            if (Date.now() - this.lastPrinted < HEARTBEAT_MS) return;
            if (this.files === 0) {
                this.print('Still finding the test files');
                return;
            }
            const unfinished = [...this.unfinished].map(([file, phase]) => `${file} (${phase})`);
            this.print(`${this.progress()}${unfinished.length === 0 ? '' : `, unfinished: ${unfinished.join(', ')}`}`);
        }, HEARTBEAT_MS);
        this.heartbeat.unref();
    }

    /**
     * Counts the files this run will execute. Vitest hands the reporter every file before it
     * shards them, so a shard asks the configured sequencer for its own slice, the same call
     * Vitest makes, rather than repeating the arithmetic here.
     */
    public async onTestRunStart(specifications: ReadonlyArray<TestSpecification>): Promise<void> {
        const config = this.vitest?.config;
        const Sequencer = config?.sequence.sequencer;
        this.files =
            config?.shard && Sequencer && this.vitest
                ? (await new Sequencer(this.vitest).shard([...specifications])).length
                : specifications.length;
        this.print(this.progress());
    }

    /** A worker has taken the file and is importing it; a file stuck here never reaches `start`. */
    public onTestModuleQueued(testModule: TestModule): void {
        this.unfinished.set(relative(process.cwd(), testModule.moduleId), 'loading');
    }

    public onTestModuleStart(testModule: TestModule): void {
        this.unfinished.set(relative(process.cwd(), testModule.moduleId), 'running');
    }

    public onTestModuleEnd(testModule: TestModule): void {
        this.unfinished.delete(relative(process.cwd(), testModule.moduleId));
        this.finished += 1;
        for (const test of testModule.children.allTests()) {
            const state = test.result().state;
            if (state === 'passed') this.passed += 1;
            else if (state === 'failed') this.failed += 1;
        }

        const step = this.files === 0 ? STEPS : Math.floor((this.finished / this.files) * STEPS);
        if (step <= this.reportedStep) return;
        this.reportedStep = step;

        this.print(this.progress());
    }

    public onTestRunEnd(): void {
        clearInterval(this.heartbeat);
    }

    /** `30% · 90/300 files · 1402 tests passed, 1 failed` */
    private progress(): string {
        const share = this.files === 0 ? 1 : this.finished / this.files;
        const failed = this.failed === 0 ? '' : `, ${this.failed} failed`;
        return `${Math.floor(share * 100)}% · ${this.finished}/${this.files} files · ${this.passed} tests passed${failed}`;
    }

    private print(line: string): void {
        this.lastPrinted = Date.now();
        process.stdout.write(`${this.label}${line}\n`);
    }
}
