/**
 * Runs a slow docs build step only when its inputs changed, or prints its input hash for a CI cache
 * key. See `build-cache.mts`.
 *
 *     node --import tsx build-cache-cli.mts run api typedoc   # run TypeDoc unless the API is current
 *     node --import tsx build-cache-cli.mts key tracker       # print the parity tracker's input hash
 */

import { execFileSync } from 'node:child_process';

import { inputHash, isStepName, runStep, steps } from './build-cache.mts';

const [action, name, command, ...args] = process.argv.slice(2);
if (!isStepName(name) || (action !== 'key' && action !== 'run') || (action === 'run' && command === undefined)) {
    console.error(`Usage: build-cache-cli.mts key <step> | run <step> <command> [args...]
Steps: ${Object.keys(steps).join(', ')}`);
    process.exit(2);
}

if (action === 'key') {
    console.log(inputHash(name));
} else if (command !== undefined) {
    runStep(name, () => execFileSync(command, args, { stdio: 'inherit' }));
}
