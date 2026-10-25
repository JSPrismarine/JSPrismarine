/**
 * A pipeline module for the pool's own tests.
 *
 * Plain JavaScript with explicit extensions, because a worker thread imports it through Node
 * rather than through the bundler, and a dev checkout resolves `@jsprismarine/*` to TypeScript.
 * It stands in for the server's real one: built once per worker, handed a setup value, and
 * answering with a flat buffer the pool transfers.
 */
import { threadId } from 'node:worker_threads';

export const createGenerationPipeline = (setup) => {
    if (setup?.fail === 'setup') throw new Error('this pipeline refuses to be built');

    // Counted per worker, so a test can tell the factory ran once rather than once per task.
    let built = 1;

    return {
        run(task) {
            if (setup?.fail === 'task') throw new Error(`no terrain at ${task.chunkX}, ${task.chunkZ}`);

            const blocks = new Int32Array(4);
            blocks[0] = task.chunkX;
            blocks[1] = task.chunkZ;
            blocks[2] = setup?.seed ?? 0;
            blocks[3] = Number(task.input ?? 0);

            return {
                payload: { status: task.status, threadId, built, blocks: blocks.buffer },
                transferList: [blocks.buffer]
            };
        }
    };
};
