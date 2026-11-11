import { SimpleEventSubtype } from '@jsprismarine/protocol/packet/SimpleEventPacket';
import type SimpleEventPacket from '@jsprismarine/protocol/packet/SimpleEventPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * A request to toggle commands or to unlock the world template settings.
 *
 * The request is recorded at debug level and dropped. Known gap: commands are enabled for
 * everyone and the world template settings are not modeled, so there is no state to change
 * and no `SetCommandsEnabledPacket` goes back.
 */
export default class SimpleEventHandler implements ConnectionLaneHandler<SimpleEventPacket> {
    public static PacketName = 'SimpleEventPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /** Logs which request the client made. */
    public handle(packet: SimpleEventPacket, { session, log }: SessionContext): void {
        const name = SimpleEventSubtype[packet.type] ?? `unknown subtype ${packet.type}`;

        log.debug(
            `${session.identity.name} sent the simple event ${name}. World settings are not modeled`,
            'SimpleEventHandler/handle'
        );
    }
}
