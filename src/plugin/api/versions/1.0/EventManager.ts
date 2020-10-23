import type Prismarine from "../../../../Prismarine";

// TODO: create an event forwarder, plugins shouldn't directly access internal classes such as the Player, World etc.
export default class EventManager {

    constructor(private server: Prismarine) { }

    private get sem() { return this.server.getEventManager() };

    get on(){ return this.sem.on.bind(this.sem); }

    get emit() { return this.sem.emit.bind(this.sem); }

};
