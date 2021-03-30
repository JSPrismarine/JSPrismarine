import { Server } from '../Prismarine';
import WorkerPool from 'workerpool';

class WorkerManager {
    private server: Server;
    private pool!: WorkerPool.WorkerPool;

    public constructor(server: Server) {
        this.server = server;
    }

    public async onEnable() {
        this.pool = WorkerPool.pool();
    }
    public async onDisable() {
        await this.pool.terminate();
    }

    public async getPool() {
        return this.pool;
    }
}

export default WorkerManager;
