/**
 * Benchmarks Java resource parsing used by setblock, fill, give, and repeated function lines.
 *
 * Run with `node packages/prismarine/benchmarks/run.mjs packages/commands/benchmarks/cmd2.bench.ts`.
 */
import os from 'node:os';

import { createCommandSource } from '../src/host';
import { registerVanillaCommands } from '../src/commands/vanilla';
import { testCommandHost, testEntity } from '../src/testing';
import { CommandRegistry } from '../src/tree';

const ITERATIONS = 1000;
const SAMPLES = 7;
const content = {
    blocks: ['minecraft:stone', 'mypack:brass_block'],
    items: ['minecraft:stick', 'mypack:wrench']
};
const dispatcher = registerVanillaCommands(new CommandRegistry({ content })).getDispatcher();
const source = createCommandSource({
    host: testCommandHost({ entities: { select: () => [testEntity()] } }),
    permissionLevel: 4
});
const cases = [
    { name: 'setblock', command: 'setblock 0 0 0 minecraft:stone' },
    { name: 'fill', command: 'fill 0 0 0 8 8 8 minecraft:stone' },
    { name: 'give', command: 'give @a minecraft:stick 1' },
    { name: 'repeated-function-line', command: 'scoreboard players add @s count 1' }
] as const;

for (const { name, command } of cases) {
    const sample = (): number => {
        const started = performance.now();
        for (let index = 0; index < ITERATIONS; index++) dispatcher.parse(command, source);
        return performance.now() - started;
    };
    for (let warmup = 0; warmup < 3; warmup++) sample();
    const runs = Array.from({ length: SAMPLES }, sample).sort((left, right) => left - right);

    console.log(
        JSON.stringify({
            benchmark: 'java-command-parse',
            name,
            node: process.version,
            platform: `${os.platform()}-${os.arch()}`,
            iterations: ITERATIONS,
            medianMs: runs[Math.floor(runs.length / 2)]
        })
    );
}
