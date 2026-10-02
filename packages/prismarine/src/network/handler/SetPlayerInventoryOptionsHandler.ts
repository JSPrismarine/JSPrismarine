import type { PlayerSession } from '../../';
import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type SetPlayerInventoryOptionsPacket from '../packet/SetPlayerInventoryOptionsPacket';
import type PacketHandler from './PacketHandler';

/**
 * Takes the player's inventory screen layout.
 *
 * Nothing acts on it yet; it is read so that clicking a tab is silent. Before the packet id
 * was read as a varint this arrived as 179 rather than 0x133 and was decoded as a ticking
 * area status, which is the error that led here.
 */
export default class SetPlayerInventoryOptionsHandler implements PacketHandler<SetPlayerInventoryOptionsPacket> {
    public static NetID = Identifiers.SetPlayerInventoryOptionsPacket;

    public handle(_packet: SetPlayerInventoryOptionsPacket, _server: Server, _session: PlayerSession): void {
        // TODO: keep the layout on the player, so it survives a rejoin.
    }
}
