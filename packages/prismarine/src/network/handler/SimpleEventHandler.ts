import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import { SimpleEventSubtype } from '../packet/SimpleEventPacket';
import type SimpleEventPacket from '../packet/SimpleEventPacket';
import type PacketHandler from './PacketHandler';

/**
 * A request to toggle commands or to unlock the world template settings.
 *
 * The request is recorded at debug level and dropped. Known gap: commands are enabled for
 * everyone and the world template settings are not modeled, so there is no state to change
 * and no `SetCommandsEnabledPacket` goes back.
 */
export default class SimpleEventHandler implements PacketHandler<SimpleEventPacket> {
    public static NetID = Identifiers.SimpleEventPacket;

    /** Logs which request the client made. */
    public handle(packet: SimpleEventPacket, server: Server, session: PlayerSession): void {
        const name = SimpleEventSubtype[packet.type] ?? `unknown subtype ${packet.type}`;

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} sent the simple event ${name}. World settings are not modeled`,
                'SimpleEventHandler/handle'
            );
    }
}
