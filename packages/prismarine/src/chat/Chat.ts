import type Console from '../Console';
import type Player from '../player/Player';

export enum ChatType {
    Raw = 0,
    Chat = 1,
    System = 6,
    Announcement = 8
}
export default class Chat {
    private readonly channel: string;
    private readonly sender: Player | Console;
    private readonly message: string;
    private readonly type: ChatType;

    public constructor(sender: Player | Console, message: string, channel = '*.everyone', type = ChatType.Chat) {
        this.sender = sender;
        this.channel = channel;
        this.message = message;
        this.type = type;
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

    public getType() {
        return this.type;
    }
}
