import type UpdateClientOptionsPacket from '@jsprismarine/protocol/packet/UpdateClientOptionsPacket';
import { GraphicsMode } from '@jsprismarine/protocol/packet/UpdateClientOptionsPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * A client settings change.
 *
 * The server does not act on the graphics mode or the profanity filter, so the change is
 * recorded at debug level and dropped.
 */
export default class UpdateClientOptionsHandler implements ConnectionLaneHandler<UpdateClientOptionsPacket> {
    public static PacketName = 'UpdateClientOptionsPacket';
    public readonly phases = ['resourcePacks', 'play'] as const;
    public readonly lane = 'connection';

    /** Logs whichever settings the packet carries. */
    public handle(packet: UpdateClientOptionsPacket, { session, log }: SessionContext): void {
        const changes: string[] = [];
        if (packet.graphicsMode !== null)
            changes.push(`graphics mode ${GraphicsMode[packet.graphicsMode] ?? packet.graphicsMode}`);
        if (packet.filterProfanity !== null) changes.push(`profanity filter ${packet.filterProfanity ? 'on' : 'off'}`);

        log.debug(
            `${session.identity.name} changed ${changes.length > 0 ? changes.join(' and ') : 'no client options'}`,
            'UpdateClientOptionsHandler/handle'
        );
    }
}
