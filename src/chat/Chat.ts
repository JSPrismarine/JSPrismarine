import type Player from '../player/Player';
import type Console from '../player/Console';

export default class Chat {
    private channel: string;
    private sender: Player | Console;
    private message: string;

    constructor(
        sender: Player | Console,
        message: string,
        channel = '*.everyone'
    ) {
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
}
