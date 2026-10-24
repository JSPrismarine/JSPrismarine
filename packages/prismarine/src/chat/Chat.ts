import type { CommandExecutor } from '../command/CommandExecutor';
import TextType from '../network/type/TextType';

/**
 * How a chat is shown. The values are the `TextType` numbers the client reads.
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

/**
 * The text packet type that carries each kind of chat to the client.
 */
export const CHAT_TEXT_TYPE: Record<ChatType, TextType> = {
    [ChatType.RAW]: TextType.Raw,
    [ChatType.CHAT]: TextType.Chat,
    [ChatType.TRANSLATION]: TextType.Translation,
    [ChatType.SYSTEM]: TextType.System,
    [ChatType.ANNOUNCEMENT]: TextType.Announcement
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
