import type Prismarine from "../../../../Prismarine";

export default class EventManager {
    private server;

    constructor(server: Prismarine) {
        this.server = server;
    }

    public async on(id: string, callback: any) {
        return await this.server.getEventManager().on(id, callback);
    }
    public async emit(id: string, value: any) {}
};
