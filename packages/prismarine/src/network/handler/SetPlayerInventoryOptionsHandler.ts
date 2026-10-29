import type { PlayerSession } from '../../';
import type Server from '../../Server';
import type SetPlayerInventoryOptionsPacket from '../packet/SetPlayerInventoryOptionsPacket';
import type PacketHandler from './PacketHandler';

/**
 * Takes the player's inventory screen layout.
 *
 * Read and dropped. The packet is a preference - which tabs the player had open and how the
 * screen was laid out - and the client reapplies its own choice on the next join, so nothing
 * breaks by not keeping it. The packet is still read so that clicking a tab is silent: before
 * the packet id was read as a varint this arrived as 179 rather than 0x133 and was decoded as
 * a ticking area status, which is the error that led here.
 *
 * Known gap: the server does not remember the layout across a rejoin. Doing so needs a field
 * on `WorldPlayerData` and matching reads and writes in `World.savePlayerData`, which is the
 * only place player state is persisted.
 */
export default class SetPlayerInventoryOptionsHandler implements PacketHandler<SetPlayerInventoryOptionsPacket> {
    public static PacketName = 'SetPlayerInventoryOptionsPacket';

    /** Accepts the packet without acting on it; see the class comment. */
    public handle(_packet: SetPlayerInventoryOptionsPacket, _server: Server, _session: PlayerSession): void {
        // Nothing to apply: the layout is the client's own preference.
    }
}
