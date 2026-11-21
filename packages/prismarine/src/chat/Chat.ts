import type { CommandExecutor } from '../command/CommandExecutor';
import type { MessageKind } from '../network/presenter/SessionPresenter';

/**
 * How a chat is shown. The values are the Bedrock `TextPacketType` numbers each kind went out as
 * when the enum was written, and stay so code that stored or compared them keeps working.
 *
 * `RAW` is a line the server has already formatted. `CHAT` is a player's own message: the
 * client draws `<name>` in front of it from the author the packet names, and offers to mute
 * or report that author by XUID.
 */
export enum ChatType {
    RAW = 0,
    CHAT = 1,
    TRANSLATION = 2,
    SYSTEM = 6,
    ANNOUNCEMENT = 8
}

/** The message kind each kind of chat is shown as. */
export const CHAT_MESSAGE_KIND: Readonly<Record<ChatType, MessageKind>> = {
    [ChatType.RAW]: 'raw',
    [ChatType.CHAT]: 'chat',
    [ChatType.TRANSLATION]: 'translation',
    [ChatType.SYSTEM]: 'system',
    [ChatType.ANNOUNCEMENT]: 'announcement'
};

/**
 * One message on its way to the players and the console.
 *
 * The type defaults to `RAW`, a line sent as written. Pass `CHAT` for a message a player
 * typed: the sender is then its author on the client, so the message itself carries no name.
 */
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
        // Clients translate for themselves; the console renders through `consoleTextOf`.
        this.needsTranslation = needsTranslation ?? false;
        this.parameters = parameters ?? [];
        this.sender = sender;
        this.type = type ?? ChatType.RAW;
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
