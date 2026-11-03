import process from 'node:process';
import { performance } from 'node:perf_hooks';

const startTime = performance.now();
const startProcessCpu = process.cpuUsage();
const startThreadCpu = process.threadCpuUsage();
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);
let tail = '';
let reported = false;
let contentLoadMilliseconds;

const observeWrite =
    (originalWrite) =>
    (...args) => {
        const [chunk] = args;
        const text = Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
        const plain = (tail + text).replace(/\u001b\[[0-9;]*m/gu, '').replace(/§[0-9a-fk-or]/giu, '');
        const result = originalWrite(...args);
        const contentLoad = /from the pack stack in ([\d.]+) ms/u.exec(plain);
        if (contentLoad !== null) contentLoadMilliseconds = Number(contentLoad[1]);
        if (!reported && plain.includes('JSPrismarine is now listening on port')) {
            reported = true;
            const processCpu = process.cpuUsage(startProcessCpu);
            const threadCpu = process.threadCpuUsage(startThreadCpu);
            // Measure retained heap after startup without charging an explicit benchmark GC to CPU.
            globalThis.gc?.();
            originalStderrWrite(
                `JSP_STARTUP_METRIC ${JSON.stringify({
                    listenMilliseconds: performance.now() - startTime,
                    contentLoadMilliseconds,
                    heapUsedBytes: process.memoryUsage().heapUsed,
                    mainThreadCpuMicroseconds: threadCpu.user + threadCpu.system,
                    processCpuMicroseconds: processCpu.user + processCpu.system
                })}\n`
            );
        }
        tail = plain.slice(-512);
        return result;
    };

// Startup and content logger lines can be written to either stream.
process.stdout.write = observeWrite(originalStdoutWrite);
process.stderr.write = observeWrite(originalStderrWrite);
