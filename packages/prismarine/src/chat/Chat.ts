import type { CommandExecutor } from '../command/CommandExecutor';

export enum ChatType {
    RAW = 0,
    CHAT = 1,
    TRANSLATION = 2,
    SYSTEM = 6,
    ANNOUNCEMENT = 8
}

export class Chat {
    private readonly channel: string;
    private readonly sender: CommandExecutor;
    private readonly message: string;
    private readonly parameters: string[];
    private readonly needsTranslation: boolean;
    private readonly type: ChatType;

    public constructor({
        channel,
        message,
        needsTranslation,
        parameters,
        sender,
        type
    }: {
        channel?: string;
        message: string;
        needsTranslation?: boolean;
        parameters?: string[];
        sender: CommandExecutor;
        type?: ChatType;
    }) {
        this.channel = channel ?? '*.everyone';
        this.message = message;
        this.needsTranslation = needsTranslation ?? false; // TODO: handle translations.
        this.parameters = parameters ?? [];
        this.sender = sender;
        this.type = type ?? ChatType.CHAT;
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
