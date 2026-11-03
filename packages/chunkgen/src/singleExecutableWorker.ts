/**
 * Worker-thread entry for a Node single executable application.
 *
 * Piscina resolves worker entry strings as filesystem paths, so the packaged server uses this
 * small message protocol to start its bundled worker from a `data:` URL instead. The pipeline
 * is another SEA asset, imported once per thread, and each result transfers its buffers back.
 */
import { getHeapStatistics } from 'node:v8';
import { parentPort, threadId, workerData } from 'node:worker_threads';

import type { GenerationResult, GenerationTask, GenerationWorkerData, WorkerPipelineFactory } from './GenerationPool';

/** What the parent sends to this worker. */
interface TaskMessage {
    readonly id: number;
    readonly task: GenerationTask;
}

/** What this worker sends back to its parent. */
interface TaskReply {
    readonly id: number;
    readonly ok: boolean;
    readonly result?: GenerationResult;
    readonly error?: { readonly name: string; readonly message: string; readonly stack?: string };
}

/** Whether a dynamically imported export can build this worker's pipeline. */
const isPipelineFactory = (value: unknown): value is WorkerPipelineFactory => typeof value === 'function';

/** Prevents generation output from depending on which isolate happens to build a chunk. */
const refuseMathRandom = (): never => {
    throw new Error(
        'Math.random is seeded per V8 isolate, so a chunk that used it would depend on which ' +
            'worker built it. Draw from the seed and the position instead.'
    );
};

const port = parentPort;
if (port === null) throw new Error('The embedded generation worker needs a parent thread');

// The pool is the only code that creates this worker and writes workerData.
const data = workerData as GenerationWorkerData;
const heapStats = data.workerHeapStats === undefined ? undefined : new Int32Array(data.workerHeapStats);
const heapSlot = heapStats === undefined ? undefined : Atomics.add(heapStats, 0, 1) + 1;
if (heapStats !== undefined && heapSlot !== undefined && heapSlot >= heapStats.length) {
    throw new RangeError(`Worker ${threadId} has no slot in the chunk-worker heap stats buffer`);
}

const loadPipeline = async () => {
    let module: Record<string, unknown>;
    if (data.pipeline.startsWith('sea-asset:')) {
        const asset = data.pipeline.slice('sea-asset:'.length);
        const sea = await import('node:sea');
        if (!sea.isSea())
            throw new Error(`Cannot load embedded generation pipeline ${asset} outside a single executable`);
        const source = sea.getAsset(asset);
        module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    } else {
        module = await import(data.pipeline);
    }

    const factory = module.createGenerationPipeline;
    if (!isPipelineFactory(factory)) throw new Error(`${data.pipeline} does not export createGenerationPipeline`);
    Math.random = refuseMathRandom;
    return factory(data.setup);
};

let pipeline: ReturnType<typeof loadPipeline> | undefined;
port.on('message', (message: TaskMessage) => {
    void (async () => {
        let reply: TaskReply;
        try {
            pipeline ??= loadPipeline();
            const result = await (await pipeline).run(message.task);
            if (heapStats !== undefined && heapSlot !== undefined) {
                Atomics.store(heapStats, heapSlot, getHeapStatistics().used_heap_size);
            }
            reply = { id: message.id, ok: true, result };
            port.postMessage(reply, [...result.transferList]);
        } catch (error) {
            const thrown = error instanceof Error ? error : new Error(String(error));
            reply = {
                id: message.id,
                ok: false,
                error: {
                    name: thrown.name,
                    message: thrown.message,
                    ...(thrown.stack === undefined ? {} : { stack: thrown.stack })
                }
            };
            port.postMessage(reply);
        }
    })();
});
