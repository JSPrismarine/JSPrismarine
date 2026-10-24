import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type ActorEventPacket from '../packet/ActorEventPacket';
import type PacketHandler from './PacketHandler';

/**
 * A client reporting something that happened to its own player, such as an arm swing.
 *
 * Nothing is acted on yet. Handled all the same: the packet is registered, and a registered
 * packet without a handler makes `PacketRegistry.getHandler` throw, which the server logged
 * as a handler error for every one a client sent.
 */
export default class ActorEventHandler implements PacketHandler<ActorEventPacket> {
    public static NetID = Identifiers.ActorEventPacket;

    /**
     * Logs the event at debug level and otherwise ignores it.
     * @param {ActorEventPacket} packet - The event the client reported.
     * @param {Server} server - The server, for its logger.
     * @param {PlayerSession} session - The client that sent it.
     */
    public handle(packet: ActorEventPacket, server: Server, session: PlayerSession): void {
        server
            .getLogger()
            .debug(
                `Ignored actor event ${packet.event} (data ${packet.data}) from §b${session.getPlayer().getName()}§r`,
                'ActorEventHandler/handle'
            );
    }
}
