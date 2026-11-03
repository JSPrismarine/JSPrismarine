import { createRequire, syncBuiltinESMExports } from 'node:module';

const startedAt = performance.now();
const startingCpu = process.threadCpuUsage();
let workerStarts = 0;
let firstWorkerStartMs;
let measurementSent = false;

const require = createRequire(import.meta.url);
const workerThreads = require('node:worker_threads');
const Worker = workerThreads.Worker;
workerThreads.Worker = new Proxy(Worker, {
    construct(target, args, newTarget) {
        workerStarts++;
        firstWorkerStartMs ??= performance.now() - startedAt;
        return Reflect.construct(target, args, newTarget);
    }
});
syncBuiltinESMExports();

const write = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, encoding, callback) => {
    const text =
        typeof chunk === 'string'
            ? chunk
            : Buffer.from(chunk).toString(typeof encoding === 'string' ? encoding : 'utf8');
    const result = write(chunk, encoding, callback);
    if (!measurementSent && text.includes('JSPrismarine is now listening on port')) {
        measurementSent = true;
        process.stderr.write(
            `__JSP_STARTUP_METRIC__${JSON.stringify({
                type: 'startup-measurement',
                timeToListenMs: performance.now() - startedAt,
                mainThreadCpuUs: process.threadCpuUsage(startingCpu),
                heapUsedBytes: process.memoryUsage().heapUsed,
                workerStarts,
                firstWorkerStartMs
            })}\n`
        );
    }
    return result;
};
