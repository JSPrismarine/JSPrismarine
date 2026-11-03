/**
 * Measures syntax exception construction and real Java command parse alternatives.
 *
 * Run with `node packages/prismarine/benchmarks/run.mjs packages/prismarine/benchmarks/commandSyntaxException.bench.ts`.
 */
import os from 'node:os';

import { CommandSyntaxException, StringReader } from '@jsprismarine/brigadier';
import { createCommandSource, registerVanillaCommands, testCommandHost } from '@jsprismarine/commands';

const SAMPLES = 5;
const EXCEPTION_THROWS = 5000;
const PARSES_PER_CASE = 1000;
const PARSE_CASES = [
    { name: 'tp-coordinate-alternative', line: 'tp @s ~ ~1 ~' },
    { name: 'tp-selector-alternative', line: 'tp @e[type=player] 0 80 0' },
    { name: 'execute-selector-alternative', line: 'execute as @e[type=zombie] at @s run tp @s ~ ~1 ~' },
    { name: 'invalid-selector-rejection', line: 'tp @e[distance=-1] 0 80 0' },
    { name: 'invalid-coordinate-rejection', line: 'tp @s ~ ~1 nope' }
] as const;

const dispatcher = registerVanillaCommands().getDispatcher();
const source = createCommandSource({ host: testCommandHost(), permissionLevel: 5 });
const reader = new StringReader('tp @s ~ ~1 ~');
const exceptionType = CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherUnknownCommand();

const sample = (): {
    readonly ms: number;
    readonly thrown: number;
    readonly rejectedParses: readonly number[];
} => {
    const started = performance.now();
    let thrown = 0;
    for (let iteration = 0; iteration < EXCEPTION_THROWS; iteration++) {
        try {
            throw exceptionType.createWithContext(reader);
        } catch (error: unknown) {
            if (!(error instanceof CommandSyntaxException)) throw error;
            thrown++;
        }
    }

    const rejectedParses = PARSE_CASES.map(({ line }) => {
        let rejected = 0;
        for (let iteration = 0; iteration < PARSES_PER_CASE; iteration++) {
            const parsed = dispatcher.parse(line, source);
            if (parsed.getExceptions().size > 0 || parsed.getReader().canRead()) rejected++;
        }
        return rejected;
    });

    return { ms: performance.now() - started, thrown, rejectedParses };
};

const previousSetting = CommandSyntaxException.ENABLE_COMMAND_STACK_TRACES;
try {
    for (const captureStack of [false, true]) {
        CommandSyntaxException.ENABLE_COMMAND_STACK_TRACES = captureStack;
        sample();
        const runs = Array.from({ length: SAMPLES }, sample).sort((left, right) => left.ms - right.ms);
        const median = runs[Math.floor(runs.length / 2)]!;
        console.log(
            JSON.stringify({
                benchmark: 'command-syntax-exceptions',
                mode: captureStack ? 'stack-enabled' : 'java-default',
                node: process.version,
                platform: `${os.platform()}-${os.arch()}`,
                exceptionThrowsPerSample: EXCEPTION_THROWS,
                parseIterationsPerCase: PARSES_PER_CASE,
                parseCases: PARSE_CASES.map(({ name }) => name),
                rejectedParsesPerCase: median.rejectedParses,
                medianMs: median.ms
            })
        );
    }
} finally {
    CommandSyntaxException.ENABLE_COMMAND_STACK_TRACES = previousSetting;
}
