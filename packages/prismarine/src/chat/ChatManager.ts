import { CHAT_TEXT_TYPE, ChatType } from './Chat';
import type { Chat } from './Chat';
import type { CommandExecutor } from '../command/CommandExecutor';
import ChatEvent from '../events/chat/ChatEvent';
import type { EventEmitter } from '../events/EventEmitter';

/** One chat line as a player's client receives it: the fields of a `Text` packet. */
export interface ChatDelivery {
    readonly message: string;
    readonly type: (typeof CHAT_TEXT_TYPE)[ChatType];
    readonly parameters: string[];
    readonly needsTranslation: boolean;
    /** The author's name, for a player's own chat only. */
    readonly sourceName?: string;
    /** The author's XUID, for a player's own chat only, and empty without one. */
    readonly xuid?: string;
}

/**
 * A connected player as the chat fan-out sees one: who they are and where their lines go.
 *
 * The name and the operator check are read when a message arrives rather than when the player
 * joins, so a name or an operator grant that changes in between is the one that counts.
 */
export interface ChatRecipient {
    /** The player's key; see `keyOfPlayer`. */
    readonly key: string;
    /** The name a `*.player.<name>` channel addresses. */
    getName(): string;
    /** Whether the `*.ops` channel reaches this player. */
    isOp(): boolean;
    /** Sends one line to the player's client. */
    receive(delivery: ChatDelivery): Promise<void>;
}

/** The part of the server's event bus chat uses. */
export type ChatBus = Pick<EventEmitter, 'on' | 'removeListener' | 'emit'>;

/** A sender that names an account, which is what a player's own chat carries to the client. */
const hasXuid = (sender: CommandExecutor): sender is CommandExecutor & { getXUID(): string | null } =>
    'getXUID' in sender && typeof sender.getXUID === 'function';

/**
 * Whether a message on `channel` reaches a recipient.
 *
 * `*.everyone` reaches every player, `*.ops` the operators and `*.player.<name>` the one player
 * of that name.
 */
const reaches = (channel: string, recipient: ChatRecipient): boolean =>
    channel === '*.everyone' ||
    (channel === '*.ops' && recipient.isOp()) ||
    channel === `*.player.${recipient.getName()}`;

/**
 * Chat for the whole server: sending a message, and which players it reaches.
 *
 * A message goes out as a `chat` event, and everything that shows chat listens for it: the
 * console, the remote console, plugins and every player that has joined. A player joins the
 * fan-out with {@link ChatManager.join} once its join completes and leaves it with
 * {@link ChatManager.leave}, both keyed by `keyOfPlayer`. The table is server-wide state, not a
 * world's, so it changes when the call is made, inside a tick or between ticks.
 *
 * Each recipient is its own `chat` listener, added when it joins. A listener that cancels the
 * event therefore stops the players who joined after that listener was added, and not the ones
 * who joined before it, as when each player subscribed itself.
 */
export class ChatManager {
    private readonly server: ChatBus;
    /** Each joined player's listener, by `keyOfPlayer`. */
    private readonly recipients = new Map<
        string,
        { recipient: ChatRecipient; listener: (event: ChatEvent) => Promise<void> }
    >();

    /** @param server - The bus `chat` events go out on, which is the server's. */
    public constructor(server: ChatBus) {
        this.server = server;
    }

    /**
     * Sends a message to the console, the plugins and every player its channel reaches.
     * @param chat - The message.
     */
    public async send(chat: Chat): Promise<void> {
        const event = new ChatEvent(chat);
        await this.server.emit('chat', event);
    }

    /**
     * Adds a player to the fan-out. A player already joined under the same key is replaced.
     * @param recipient - The connected player.
     */
    public join(recipient: ChatRecipient): void {
        const { key } = recipient;
        const previous = this.recipients.get(key);
        if (previous !== undefined) this.leave(previous.recipient);

        const listener = async (event: ChatEvent): Promise<void> => {
            if (event.isCanceled()) return;
            await this.deliver(event.getChat(), recipient);
        };
        this.recipients.set(key, { recipient, listener });
        this.server.on('chat', listener);
    }

    /**
     * Takes a player out of the fan-out. Does nothing when another player holds the key by
     * now, so a replaced login leaving late does not take its successor's chat with it.
     * @param recipient - The recipient {@link ChatManager.join} was given.
     */
    public leave(recipient: ChatRecipient): void {
        const entry = this.recipients.get(recipient.key);
        if (entry?.recipient !== recipient) return;
        this.recipients.delete(recipient.key);
        this.server.removeListener('chat', entry.listener);
    }

    /**
     * Whether a player is in the fan-out under a key.
     * @param key - The player's key; see `keyOfPlayer`.
     */
    public hasJoined(key: string): boolean {
        return this.recipients.has(key);
    }

    /** Puts a message on one recipient's screen, when its channel reaches them. */
    private async deliver(chat: Chat, recipient: ChatRecipient): Promise<void> {
        // TODO: proper channel system
        if (!reaches(chat.getChannel(), recipient)) return;

        // A player's chat names its author, as a dedicated server does: the client draws
        // `<name>` from it and can mute or report the XUID, which it checks against the
        // player list. Every other type is a line the server formatted, sent as written.
        const sender = chat.getSender();
        const author =
            chat.getType() === ChatType.CHAT
                ? { sourceName: sender.getName(), xuid: hasXuid(sender) ? (sender.getXUID() ?? '') : '' }
                : {};

        await recipient.receive({
            message: chat.getMessage(),
            type: CHAT_TEXT_TYPE[chat.getType()],
            parameters: chat.getParameters(),
            needsTranslation: chat.isNeedsTranslation(),
            ...author
        });
    }
}
