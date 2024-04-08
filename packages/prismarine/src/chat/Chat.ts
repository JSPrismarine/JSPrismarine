import type Console from '../Console';
import type Player from '../Player';

export enum ChatType {
    RAW = 0,
    CHAT = 1,
    TRANSLATION = 2,
    SYSTEM = 6,
    ANNOUNCEMENT = 8
}
export default class Chat {
    private readonly channel: string;
    private readonly sender: Player | Console;
    private readonly message: string;
    private readonly parameters: string[];
    private readonly needsTranslation: boolean;
    private readonly type: ChatType;

    public constructor(
        sender: Player | Console,
        message: string,
        parameters: string[] = [],
        needsTranslation = false,
        channel = '*.everyone',
        type = ChatType.CHAT
    ) {
        this.sender = sender;
        this.channel = channel;
        this.message = message;
        this.parameters = parameters;
        this.needsTranslation = needsTranslation;
        this.type = type;
    }

    public getChannel(): string {
        return this.channel;
    }

    public getSender() {
        return this.sender;
    }

    public getMessage(): string {
        return this.message;
    }

    public getParameters(): string[] {
        return this.parameters;
    }

    public isNeedsTranslation(): boolean {
        return this.needsTranslation;
    }

    public getType(): ChatType {
        return this.type;
    }
}
