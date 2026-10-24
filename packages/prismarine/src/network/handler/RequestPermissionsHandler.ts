import { PlayerPermissionLevel } from '@jsprismarine/minecraft';
import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type RequestPermissionsPacket from '../packet/RequestPermissionsPacket';
import type PacketHandler from './PacketHandler';

/**
 * A request to change a player's permission level.
 *
 * The request is recorded at debug level and no level changes. Known gap: the server's
 * permission model is command-based (`isOp` and permission strings) and has no per-player
 * `PlayerPermissionLevel` to update or to broadcast back in `UpdateAbilitiesPacket`.
 */
export default class RequestPermissionsHandler implements PacketHandler<RequestPermissionsPacket> {
    public static NetID = Identifiers.RequestPermissionsPacket;

    /** Logs the target and the requested level. */
    public handle(packet: RequestPermissionsPacket, server: Server, session: PlayerSession): void {
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} asked to set player ${packet.targetPlayerUniqueId} to permission level ${PlayerPermissionLevel[packet.playerPermissionLevel] ?? packet.playerPermissionLevel} (custom flags 0x${packet.customPermissionFlags.toString(16)}). Permission levels are not modeled, so nothing changed`,
                'RequestPermissionsHandler/handle'
            );
    }
}
