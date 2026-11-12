import { DisconnectReason } from '@jsprismarine/minecraft';
import type ResourcePackChunkRequestPacket from '@jsprismarine/protocol/packet/ResourcePackChunkRequestPacket';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

/**
 * A request for one chunk of a resource pack the client is downloading.
 *
 * A client asks for chunks only of packs the server listed in `ResourcePacksInfoPacket` and
 * described in `ResourcePackDataInfoPacket`. `LoginHandler` lists none, so no `Resource Name`
 * can match a served pack and there is no chunk to answer with. The request is logged at debug
 * level and the connection is closed with the resource pack reason, the same answer
 * `ResourcePackClientResponseHandler` gives a `SendPacks` status, rather than leaving the
 * client on its download screen until RakNet times it out.
 *
 * Once the server serves packs, this is where `Resource Name` is matched against them, `Chunk`
 * is checked against that pack's `Number of Chunks`, and a `ResourcePackChunkDataPacket`
 * carries the chunk back.
 */
export default class ResourcePackChunkRequestHandler implements InputLaneHandler<ResourcePackChunkRequestPacket> {
    public static PacketName = 'ResourcePackChunkRequestPacket';
    public readonly phases = ['resourcePacks'] as const;
    // Input: the kick tears the player down and announces the departure to everyone.
    public readonly lane = 'input';

    /** Logs the requested pack and chunk, then disconnects the client. */
    public handle(packet: ResourcePackChunkRequestPacket, { session, log, step }: InputContext): undefined {
        log.debug(
            `${session.identity.name} requested chunk ${packet.chunk} of pack ${packet.resourceName}, which the server does not serve`,
            'ResourcePackChunkRequestHandler/handle'
        );
        // The kick queues the goodbye and takes the player off in this input's unit; the step
        // lets the connection close without waiting for it.
        step.output(
            session.kick('Asked for a resource pack this server does not have', DisconnectReason.RESOURCE_PACK_PROBLEM)
        );
    }
}
