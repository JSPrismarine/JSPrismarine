/**
 * Benchmarks parsing and executing a 1,000-line Java function tick.
 *
 * Run with `node packages/prismarine/benchmarks/run.mjs packages/prismarine/benchmarks/functionTick.bench.ts`.
 */
import os from 'node:os';

import type { ParseResults } from '@jsprismarine/brigadier';
import { createCommandSource, registerVanillaCommands, testCommandHost } from '@jsprismarine/commands';

const LINE_COUNT = 1000;
const TICKS = 20;
const SAMPLES = 5;
const commandLine = 'scoreboard players add Counter objective 1';
const lines = Array.from({ length: LINE_COUNT }, () => commandLine);
const dispatcher = registerVanillaCommands().getDispatcher();
const source = createCommandSource({ host: testCommandHost(), permissionLevel: 4 });
const parsed = dispatcher.parse(commandLine, source);

const sample = (cached: boolean): { readonly ms: number; readonly parses: number; readonly executions: number } => {
    let parses = 0;
    let executions = 0;
    const started = performance.now();
    for (let tick = 0; tick < TICKS; tick++) {
        for (const line of lines) {
            const result: ParseResults<typeof source> = cached
                ? parsed.copyFor(source)
                : dispatcher.parse(line, source);
            if (!cached) parses++;
            dispatcher.execute(result);
            executions++;
        }
    }
    return { ms: performance.now() - started, parses, executions };
};

for (const cached of [false, true]) {
    const runs = Array.from({ length: SAMPLES }, () => sample(cached)).sort((left, right) => left.ms - right.ms);
    const median = runs[Math.floor(runs.length / 2)]!;
    console.log(
        JSON.stringify({
            benchmark: 'function-tick-command-lines',
            mode: cached ? 'cached-parse' : 'parse-each-line',
            node: process.version,
            platform: `${os.platform()}-${os.arch()}`,
            linesPerTick: LINE_COUNT,
            ticks: TICKS,
            parses: median.parses,
            executions: median.executions,
            medianMs: median.ms
        })
    );
}
