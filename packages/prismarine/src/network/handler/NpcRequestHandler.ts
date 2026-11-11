import type NpcRequestPacket from '@jsprismarine/protocol/packet/NpcRequestPacket';
import { NpcRequestType } from '@jsprismarine/protocol/packet/NpcRequestPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * What a player did with an NPC.
 *
 * The request is recorded at debug level and dropped. Known gap: no actor carries the NPC
 * component, so there is no dialogue to show, no actions to store and no commands to run.
 */
export default class NpcRequestHandler implements ConnectionLaneHandler<NpcRequestPacket> {
    public static PacketName = 'NpcRequestPacket';
    public readonly takes = 'context';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /** Logs the request type and the NPC it names. */
    public handle(packet: NpcRequestPacket, { session, log }: SessionContext): void {
        const requestType = NpcRequestType[packet.requestType] ?? packet.requestType;

        log.debug(
            `${session.identity.name} sent ${requestType} to NPC ${packet.npcRuntimeId}, which the server has no NPCs to apply`,
            'NpcRequestHandler/handle'
        );
    }
}
