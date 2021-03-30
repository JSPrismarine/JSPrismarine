import { Server } from '../Prismarine';

class WorkerManager {
    private server: Server;

    public constructor(server: Server) {
        this.server = server;
    }

    public async onEnable() {}
    public async onDisable() {}
}

export default WorkerManager;
