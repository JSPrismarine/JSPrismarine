import { CHAT_TEXT_TYPE, ChatType } from './Chat';
import type { Chat } from './Chat';
import type { CommandExecutor } from '../command/CommandExecutor';
import ChatEvent from '../events/chat/ChatEvent';
import type { ServerEventBus } from '../events/ServerEvents';
import type { PlayerIdentity } from '../playerIdentity';
import { playerKeyOf } from '../playerIdentity';

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

/** The session registry, as a recipient finds its player's client in it. */
export interface ChatSessions {
    /** The client of the online player with this entity id, or null when no online player has it. */
    sessionOf(id: bigint): { sendMessage(delivery: ChatDelivery): Promise<void> } | null;
}

/** What a recipient built by {@link chatRecipientOf} reads of the server. */
export interface ChatRecipientServer {
    getSessionManager(): ChatSessions;
    getPermissionManager(): { isOp(uuid: string): boolean };
}

/**
 * A connected player as the chat fan-out reaches them, built from who they are.
 *
 * The key and the name come from the identity and the operator check from the permission list.
 * Each line goes to the session the registry finds under the player's entity id, so the
 * recipient holds neither the player nor its client, and a line for a player who has left
 * reaches nobody.
 * @param player - The player's entity id and identity, as its session holds them.
 * @param player.runtimeId - The entity id the registry finds the session by.
 * @param player.identity - The name, XUID and UUID the login named.
 * @param server - The session registry and the permission list.
 * @returns The recipient, to join once and leave with.
 */
export const chatRecipientOf = (
    { runtimeId, identity }: { readonly runtimeId: bigint; readonly identity: PlayerIdentity },
    server: ChatRecipientServer
): ChatRecipient => ({
    key: playerKeyOf(identity),
    getName: () => identity.name,
    isOp: () => server.getPermissionManager().isOp(identity.uuid),
    receive: async (delivery) => server.getSessionManager().sessionOf(runtimeId)?.sendMessage(delivery)
});

/** The part of the server's event bus chat uses. */
export type ChatBus = Pick<ServerEventBus, 'post'>;

/** A line a player typed, as the chat action's guard stage sees it. */
export interface PlayerChatIntent {
    /** The entity id of the player who typed it. */
    readonly sender: bigint;
    readonly message: string;
}

/**
 * A guard in the chat action's guard stage ([ADR 0013](../../../../docs/adr/0013-vetoable-actions-are-staged.md)).
 * It reads the line, writes nothing, and lets it through or vetoes it.
 */
export type PlayerChatGuard = (
    intent: PlayerChatIntent
) => { readonly veto: true } | { readonly veto: false; readonly intent: PlayerChatIntent };

/** A sender that is a player in a world, which is what a player's own chat comes from. */
const hasRuntimeId = (sender: CommandExecutor): sender is CommandExecutor & { getRuntimeId(): bigint } =>
    'getRuntimeId' in sender && typeof sender.getRuntimeId === 'function';

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
 * A message goes out as a `chat` event first, which the console, the remote console and plugins
 * listen for, and then to every player that has joined whom its channel reaches. A player joins
 * the fan-out with {@link ChatManager.join} once its join completes and leaves it with
 * {@link ChatManager.leave}, both keyed by `keyOfPlayer`. The table is server-wide state, not a
 * world's, so it changes when the call is made, inside a tick or between ticks.
 *
 * A line a player typed goes past the guard stage first, where a script's `chatSend`
 * before-event runs, and a veto there drops it before the event or any player sees it.
 *
 * The event is a before-hook: its listeners are called in the order they subscribed, and a
 * listener that cancels it before its first wait stops every player, whenever they joined. The
 * players are not listeners themselves, so the fan-out is one pass over them after the event.
 */
export class ChatManager {
    private readonly events: ChatBus;
    private readonly guards: PlayerChatGuard[] = [];
    private readonly sentListeners: ((intent: PlayerChatIntent) => void)[] = [];
    /** Each joined player, by `keyOfPlayer`, in the order they joined. */
    private readonly recipients = new Map<string, ChatRecipient>();

    /** @param events - The bus `chat` events go out on, which is the server's. */
    public constructor(events: ChatBus) {
        this.events = events;
    }

    /**
     * Sends a message to the console, the plugins and every player its channel reaches.
     *
     * The `chat` listeners run first, each to its first wait, and the players get the message
     * once they all have, unless one canceled it. Every line is queued before this returns.
     * @param chat - The message.
     * @returns When the transport has framed every player's line.
     */
    public send(chat: Chat): Promise<void> {
        const sender = chat.getSender();
        let intent: PlayerChatIntent | undefined;
        if (chat.getType() === ChatType.CHAT && hasRuntimeId(sender)) {
            intent = { sender: sender.getRuntimeId(), message: chat.getMessage() };
            const guarded = intent;
            if (this.guards.some((guard) => guard(guarded).veto)) return Promise.resolve();
        }
        const event = new ChatEvent(chat);
        this.events.post('chat', event);
        if (event.isCanceled()) return Promise.resolve();
        if (intent !== undefined) for (const listener of [...this.sentListeners]) listener(intent);
        return Promise.all([...this.recipients.values()].map((recipient) => this.deliver(chat, recipient))).then(
            () => {}
        );
    }

    /**
     * Adds a guard to the guard stage of a player's chat, after the ones already there.
     * @returns A function that removes it.
     */
    public addGuard(guard: PlayerChatGuard): () => void {
        this.guards.push(guard);
        return () => {
            const index = this.guards.indexOf(guard);
            if (index >= 0) this.guards.splice(index, 1);
        };
    }

    /**
     * Calls `listener` with each line a player typed that went past the guards and the `chat`
     * event, as it goes out to the players, for a script's `world.afterEvents.chatSend`.
     * @returns A function that stops it.
     */
    public onSent(listener: (intent: PlayerChatIntent) => void): () => void {
        this.sentListeners.push(listener);
        return () => {
            const index = this.sentListeners.indexOf(listener);
            if (index >= 0) this.sentListeners.splice(index, 1);
        };
    }

    /**
     * Adds a player to the fan-out. A player already joined under the same key is replaced.
     * @param recipient - The connected player.
     */
    public join(recipient: ChatRecipient): void {
        // Deleted first, so a replacing login goes to the end of the order, as a new join does.
        this.recipients.delete(recipient.key);
        this.recipients.set(recipient.key, recipient);
    }

    /**
     * Takes a player out of the fan-out. Does nothing when another player holds the key by
     * now, so a replaced login leaving late does not take its successor's chat with it.
     * @param recipient - The recipient {@link ChatManager.join} was given.
     */
    public leave(recipient: ChatRecipient): void {
        if (this.recipients.get(recipient.key) !== recipient) return;
        this.recipients.delete(recipient.key);
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
