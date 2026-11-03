import type { GenerationTask, WorkerPipeline } from '@jsprismarine/chunkgen';

/** A no-worldgen pipeline that proves the TSX worker can receive and return one task. */
export const createGenerationPipeline = (): WorkerPipeline => ({
    run: (task: GenerationTask) => ({ payload: `${task.chunkX},${task.chunkZ}`, transferList: [] })
});
