/**
 * A player's arrival in the world, the same for both editions: the console line, the
 * `playerSpawn` event a listener may cancel, and the message that tells everyone they joined.
 * Each edition calls these at its own point of the join: Bedrock's resource pack exchange, and
 * Java's step into play.
 */
import { Chat, ChatType } from '../chat/Chat';
import type { ChatManager } from '../chat/ChatManager';
import type { ConsoleSender } from '../command/ConsoleSender';
import PlayerSpawnEvent from '../events/player/PlayerSpawnEvent';
import type { ServerEventBus } from '../events/ServerEvents';
import type { HandlerLog } from './handler/HandlerContext';
import type PlayerSession from './PlayerSession';

/**
 * Logs that a player is joining, and from where, and posts `playerSpawn`.
 * @param services - The log, and the events a listener hears it on.
 * @param session - The joining player.
 * @returns False when a listener cancelled the join.
 */
export const playerArriving = (
    { log, events }: { readonly log: Pick<HandlerLog, 'info'>; readonly events: Pick<ServerEventBus, 'post'> },
    session: PlayerSession
): boolean => {
    const { identity } = session;
    const connection = session.getConnection();
    const address = connection.getAddress();
    log.info(
        `§b${identity.name}§f is joining over ${connection.getTransport()} from ${address.getAddress()}:${address.getPort()} with id §b${identity.uuid}§f (§b${session.runtimeId}§f)`
    );
    const spawnEvent = new PlayerSpawnEvent(session);
    events.post('playerSpawn', spawnEvent);
    return !spawnEvent.isCanceled();
};

/**
 * Tells everyone the player joined, the last thing of a join so it lands on a client that can show
 * it, and records that it did, so the player's leave is told too.
 * @param services - The chat, and the console it is sent as.
 * @param session - The player who joined.
 * @returns Settles once the message is sent.
 */
export const announceArrival = (
    { chat, console }: { readonly chat: Pick<ChatManager, 'send'>; readonly console: ConsoleSender },
    session: PlayerSession
): Promise<void> => {
    const sent = chat.send(
        new Chat({
            sender: console,
            // The bare translation key: a color code in front of the `%` stops the client
            // resolving it, and it renders the unresolved string instead.
            message: `%multiplayer.player.joined`,
            parameters: [session.identity.name],
            needsTranslation: true,
            type: ChatType.TRANSLATION
        })
    );
    session.announcedJoin();
    return sent;
};
