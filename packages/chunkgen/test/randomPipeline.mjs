/** A pipeline that reaches for the one source of randomness that differs between threads. */
export const createGenerationPipeline = () => ({
    run(task) {
        const blocks = new Int32Array([task.chunkX, Math.floor(Math.random() * 16)]);
        return { payload: { blocks: blocks.buffer }, transferList: [blocks.buffer] };
    }
});
