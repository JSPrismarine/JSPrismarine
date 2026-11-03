export const createGenerationPipeline = () => ({
    run(task) {
        if (task.input === 'exit') process.exit(19);
        return { payload: { chunkX: task.chunkX, chunkZ: task.chunkZ }, transferList: [] };
    }
});
