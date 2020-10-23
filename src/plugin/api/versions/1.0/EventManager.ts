import type Prismarine from "../../../../Prismarine";

// TODO: create an event forwarder, plugins shouldn't directly access internal classes such as the Player, World etc.
export default class EventManager {
    private server;

    constructor(server: Prismarine) {
        this.server = server;
    }

    private get em(){ return this.server.getEventManager(); }

    /*
    get $attach(){ return this.em.$attach.bind(this.em); }

    get post() { return this.em.post.bind(this.em); }
    */

};
