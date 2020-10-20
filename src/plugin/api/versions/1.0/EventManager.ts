import type Prismarine from "../../../../Prismarine";

export default class EventManager {
    private server;

    constructor(server: Prismarine) {
        this.server = server;
    }

    public on(id: string, callback: any) {
        return this.server.getEventManager().on(id, callback);
    }
    public emit(id: string, value: any) {}
};
