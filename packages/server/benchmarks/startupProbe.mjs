import process from 'node:process';
import { performance } from 'node:perf_hooks';

const startTime = performance.now();
const startProcessCpu = process.cpuUsage();
const startThreadCpu = process.threadCpuUsage();
const originalWrite = process.stdout.write.bind(process.stdout);
let tail = '';
let reported = false;

process.stdout.write = (...args) => {
    const [chunk] = args;
    const text = Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
    const result = originalWrite(...args);
    if (!reported && (tail + text).includes('JSPrismarine is now listening on port')) {
        reported = true;
        const processCpu = process.cpuUsage(startProcessCpu);
        const threadCpu = process.threadCpuUsage(startThreadCpu);
        // Measure retained heap after startup without charging an explicit benchmark GC to CPU.
        globalThis.gc?.();
        process.stderr.write(
            `JSP_STARTUP_METRIC ${JSON.stringify({
                listenMilliseconds: performance.now() - startTime,
                heapUsedBytes: process.memoryUsage().heapUsed,
                mainThreadCpuMicroseconds: threadCpu.user + threadCpu.system,
                processCpuMicroseconds: processCpu.user + processCpu.system
            })}\n`
        );
    }
    tail = (tail + text).slice(-96);
    return result;
};
