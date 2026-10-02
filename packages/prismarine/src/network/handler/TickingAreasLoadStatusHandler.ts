import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type TickingAreasLoadStatusPacket from '../packet/TickingAreasLoadStatusPacket';
import type PacketHandler from './PacketHandler';

/**
 * The client saying whether it is still waiting for ticking areas to preload.
 *
 * Nothing to do: this server has no ticking areas, so it is never the thing the client is
 * waiting for. Handled all the same - a registered packet with no handler is an error per
 * packet rather than a warning per packet.
 */
export default class TickingAreasLoadStatusHandler implements PacketHandler<TickingAreasLoadStatusPacket> {
    public static NetID = Identifiers.TickingAreasLoadStatusPacket;

    public async handle(
        _packet: TickingAreasLoadStatusPacket,
        _server: Server,
        _session: PlayerSession
    ): Promise<void> {}
}
