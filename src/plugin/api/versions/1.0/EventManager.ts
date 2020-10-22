import type Prismarine from "../../../../Prismarine";

// TODO: create an event forwarder, plugins shouldn't directly access internal classes such as the Player, World etc.
export default class EventManager implements ReturnType<typeof Prismarine.prototype.getEventManager> {

    constructor(private server: Prismarine) {
    }

    evtRaknetConnect = this.server.getEventManager().evtRaknetConnect;
    evtRaknetDisconnect = this.server.getEventManager().evtRaknetDisconnect;
    evtRaknetEncapsulatedPacket = this.server.getEventManager().evtRaknetEncapsulatedPacket;
    evtChat = this.server.getEventManager().evtChat;
    evtPlayerConnect = this.server.getEventManager().evtPlayerConnect;
    evtPlayerDisconnect = this.server.getEventManager().evtPlayerDisconnect;
    evtPlayerSpawn = this.server.getEventManager().evtPlayerDespawn;
    evtPlayerDespawn = this.server.getEventManager().evtPlayerDespawn;
    evtPlayerMove = this.server.getEventManager().evtPlayerMove;

};


