import type Player from "../player";

export default class Chat {
    private channel: string;
    private sender: Player;
    private message: string;

    constructor(sender: Player, message: string, channel = 'global.everyone') {
        this.sender = sender;
        this.channel = channel;
        this.message = message;
    }

    public getChannel() {
        return this.channel;
    }
    public getSender() {
        return this.sender;
    }
    public getMessage() {
        return this.message;
    }

    public getFormattedMessage() {
        return `${this.getSender().getFormattedUsername()} ${this.getMessage()}`;
    }
};
