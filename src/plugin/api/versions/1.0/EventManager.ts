import type Prismarine from "../../../../Prismarine";

// TODO: create an event forwarder, plugins shouldn't directly access internal classes such as the Player, World etc.
export default class EventManager {
    private server;

    constructor(server: Prismarine) {
        this.server = server;
    }

    public async on(id: string, callback: any) {
        return await this.server.getEventManager().on(id, callback);
    }
    public async emit(id: string, value: any) {
        return await this.server.getEventManager().emit(id, value);
    }
};
