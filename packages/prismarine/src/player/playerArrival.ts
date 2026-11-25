/**
 * A player's arrival in the world, the same for both editions: the console line, the
 * `playerSpawn` event a listener may cancel, and the message that tells everyone they joined.
 * Each edition calls these at its own point of the join: Bedrock's resource pack exchange, and
 * Java's step into play.
 */
import { DisconnectReason } from '@jsprismarine/minecraft';

import { Chat, ChatType } from '../chat/Chat';
import { englishOf } from '../chat/ConsoleText';
import type { ChatManager } from '../chat/ChatManager';
import type { ConsoleSender } from '../command/ConsoleSender';
import PlayerSpawnEvent from '../events/player/PlayerSpawnEvent';
import type { ServerEventBus } from '../events/ServerEvents';
import type { HandlerLog } from '../network/handler/HandlerContext';
import type PlayerSession from './PlayerSession';

/** Whether a join goes on, or the player is on the way out because a listener cancelled it. */
export type Arrival = { readonly joins: true } | { readonly joins: false; readonly leaving: Promise<void> };

/**
 * Logs that a player is joining, and from where, and posts `playerSpawn`. A listener that cancels
 * the event disconnects the player, on either edition, rather than leave its client waiting on a
 * world that never comes.
 * @param services - The log, and the events a listener hears it on.
 * @param session - The joining player.
 * @returns Whether the join goes on; when it does not, the disconnect, which settles once the
 *   connection is closed.
 */
export const playerArriving = (
    { log, events }: { readonly log: Pick<HandlerLog, 'info'>; readonly events: Pick<ServerEventBus, 'post'> },
    session: PlayerSession
): Arrival => {
    const { identity } = session;
    const connection = session.getConnection();
    const address = connection.getAddress();
    log.info(
        `§b${identity.name}§f is joining over ${connection.getTransport()} from ${address.getAddress()}:${address.getPort()} with id §b${identity.uuid}§f (§b${session.runtimeId}§f)`
    );
    const spawnEvent = new PlayerSpawnEvent(session);
    events.post('playerSpawn', spawnEvent);
    if (!spawnEvent.isCanceled()) return { joins: true };
    return {
        joins: false,
        leaving: session.kick(englishOf('jsprismarine.disconnect.join_refused'), DisconnectReason.DISCONNECTED)
    };
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
