import { CHAT_TEXT_TYPE, ChatType } from './Chat';
import type { Chat } from './Chat';
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

/** A connected player as chat fan-out sees one: who they are and where their lines go. */
export interface ChatRecipient {
    /** The player's key, from `playerKeyOf`. */
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

/**
 * Sends chat to everybody it is for: the server's `chat` event for the console and plugins,
 * and one delivery to each connected player the channel reaches.
 *
 * Players join and leave the fan-out by key, and the fan-out listens to the `chat` event once
 * for all of them, where each player used to listen for itself. The listener is added when the
 * first player joins and removed when the last one leaves, which is where the first player's
 * own listener used to sit: a listener a plugin added at startup still runs first, so a chat it
 * cancels synchronously is still not delivered.
 *
 * Delivery is one step, {@link ChatManager.deliver}, after the cancellation check, so a guard
 * that vetoes a message can go in front of it.
 */
export class ChatManager {
    private readonly bus: ChatBus;
    private readonly recipients = new Map<string, ChatRecipient>();
    private readonly listener = (event: ChatEvent): Promise<number> | undefined => {
        if (event.isCanceled()) return undefined;
        return this.deliver(event.getChat());
    };

    public constructor(bus: ChatBus) {
        this.bus = bus;
    }

    /**
     * Announces a chat on the server's `chat` event, which delivers it to every player it is for.
     * @param chat - The message.
     */
    public async send(chat: Chat): Promise<void> {
        const event = new ChatEvent(chat);
        await this.bus.emit('chat', event);
    }

    /**
     * Starts delivering chat to a player. A second recipient with the same key replaces the first.
     * @param recipient - The connected player.
     */
    public join(recipient: ChatRecipient): void {
        if (this.recipients.size === 0) this.bus.on('chat', this.listener);
        this.recipients.set(recipient.key, recipient);
    }

    /**
     * Stops delivering chat to a player. Does nothing when another recipient holds the key now,
     * so a session that was replaced cannot take its successor's chat away as it closes.
     * @param recipient - The recipient {@link ChatManager.join} was given.
     */
    public leave(recipient: ChatRecipient): void {
        if (this.recipients.get(recipient.key) !== recipient) return;
        this.recipients.delete(recipient.key);
        if (this.recipients.size === 0) this.bus.removeListener('chat', this.listener);
    }

    /**
     * Sends a chat to each connected player its channel reaches, without the `chat` event.
     *
     * `*.everyone` reaches everybody, `*.ops` the operators, and `*.player.<name>` the player
     * with that name. A player's own chat names its author, as a dedicated server does: the
     * client draws `<name>` from it and can mute or report the XUID, which it checks against the
     * player list. Every other type is a line the server formatted, sent as written.
     *
     * Every send starts before any is awaited, as the players' own listeners used to.
     * @param chat - The message.
     * @returns How many players it was sent to.
     */
    public async deliver(chat: Chat): Promise<number> {
        const channel = chat.getChannel();
        const sender = chat.getSender();
        const author =
            chat.getType() === ChatType.CHAT
                ? {
                      sourceName: sender.getName(),
                      // A player's executor carries its XUID; the console has none.
                      xuid: 'getXUID' in sender && typeof sender.getXUID === 'function' ? (sender.getXUID() ?? '') : ''
                  }
                : {};
        const delivery: ChatDelivery = {
            message: chat.getMessage(),
            type: CHAT_TEXT_TYPE[chat.getType()],
            parameters: chat.getParameters(),
            needsTranslation: chat.isNeedsTranslation(),
            ...author
        };

        const sends = [...this.recipients.values()]
            .filter(
                (recipient) =>
                    channel === '*.everyone' ||
                    (channel === '*.ops' && recipient.isOp()) ||
                    channel === `*.player.${recipient.getName()}`
            )
            .map((recipient) => recipient.receive(delivery));
        await Promise.all(sends);
        return sends.length;
    }
}
