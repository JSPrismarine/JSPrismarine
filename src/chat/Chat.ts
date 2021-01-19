import type Console from '../Console';
import type Player from '../player/Player';

export default class Chat {
    private readonly channel: string;
    private readonly sender: Player | Console;
    private readonly message: string;

    public constructor(
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
