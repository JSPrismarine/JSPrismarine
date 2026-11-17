/**
 * Runs one engine on a worker thread and posts what it counted, so a test can run engines on
 * several threads at once. The worker loads its own copy of the library's binding.
 */
import { parentPort, workerData } from 'node:worker_threads';

import { ScriptHostLibrary } from '../ScriptEngine';
import { ScriptTerminatedError } from '../errors';

/** What the worker reports. */
export interface EngineWorkerReport {
    readonly sum: unknown;
    readonly hostCalls: number;
    readonly terminatedAtStep: number;
}

const iterations = Number(workerData);
const library = ScriptHostLibrary.load();
const engine = library.createEngine();
engine.defineGlobalFunction('square', (n) => Number(n) * Number(n));
const sum = engine.evaluate(`let sum = 0; for (let i = 0; i < ${iterations}; i++) sum += square(i % 10); sum`);
const hostCalls = engine.stats().hostCalls;

engine.setBudget({ perCallback: 50 });
let terminatedAtStep = -1;
try {
    engine.evaluate('while (true) {}');
} catch (error) {
    if (error instanceof ScriptTerminatedError) terminatedAtStep = engine.stats().callbackSteps;
}
engine.destroy();
library.close();

const report: EngineWorkerReport = { sum, hostCalls, terminatedAtStep };
parentPort?.postMessage(report);
