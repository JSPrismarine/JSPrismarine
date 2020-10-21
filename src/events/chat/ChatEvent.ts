import type Player from "../../player";
import Event from "../Event";

/**
 * Fired right just after player spawns into the world
 */
export default class ChatEvent extends Event {
    private sender;
    private message;

    constructor(sender: Player, message: string) {
        super();
        this.sender = sender;
        this.message = message;
    }

    getSender(): Player {
        return this.sender;
    }

    getMessage(): string {
        return this.message;
    }
};
