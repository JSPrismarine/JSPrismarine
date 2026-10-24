import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type NpcRequestPacket from '../packet/NpcRequestPacket';
import { NpcRequestType } from '../packet/NpcRequestPacket';
import type PacketHandler from './PacketHandler';

/**
 * What a player did with an NPC.
 *
 * The request is recorded at debug level and dropped. Known gap: no actor carries the NPC
 * component, so there is no dialogue to show, no actions to store and no commands to run.
 */
export default class NpcRequestHandler implements PacketHandler<NpcRequestPacket> {
    public static NetID = Identifiers.NpcRequestPacket;

    /** Logs the request type and the NPC it names. */
    public handle(packet: NpcRequestPacket, server: Server, session: PlayerSession): void {
        const requestType = NpcRequestType[packet.requestType] ?? packet.requestType;

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} sent ${requestType} to NPC ${packet.npcRuntimeId}, which the server has no NPCs to apply`,
                'NpcRequestHandler/handle'
            );
    }
}
