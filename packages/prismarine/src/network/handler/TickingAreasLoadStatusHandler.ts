import type TickingAreasLoadStatusPacket from '@jsprismarine/protocol/packet/TickingAreasLoadStatusPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * The client saying whether it is still waiting for ticking areas to preload.
 *
 * Nothing to do: this server has no ticking areas, so it is never the thing the client is
 * waiting for. Handled all the same - a registered packet with no handler is an error per
 * packet rather than a warning per packet.
 */
export default class TickingAreasLoadStatusHandler implements ConnectionLaneHandler<TickingAreasLoadStatusPacket> {
    public static PacketName = 'TickingAreasLoadStatusPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    public async handle(_packet: TickingAreasLoadStatusPacket, _context: SessionContext): Promise<void> {}
}
