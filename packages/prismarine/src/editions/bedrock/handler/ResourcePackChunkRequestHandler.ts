import { DisconnectReason } from '@jsprismarine/minecraft';
import ResourcePackChunkDataPacket from '@jsprismarine/protocol/bedrock/packet/ResourcePackChunkDataPacket';
import type ResourcePackChunkRequestPacket from '@jsprismarine/protocol/bedrock/packet/ResourcePackChunkRequestPacket';
import type { InputContext } from '../../../player/context/HandlerContext';
import type { InputLaneHandler } from '../../../player/context/SessionHandler';
import { chunkOf } from '../../../resourcePacks/ServedResourcePacks';

/**
 * A request for one chunk of a resource pack the client is downloading.
 *
 * A client asks for chunks only of packs the server listed in `ResourcePacksInfoPacket` and
 * described in `ResourcePackDataInfoPacket`. `Resource Name` is matched against the packs the
 * server offered, `Chunk` is checked against that pack's `Number of Chunks`, and a
 * `ResourcePackChunkDataPacket` carries the chunk back. A pack the server never offered, or a
 * chunk past a pack's last, ends the connection with the resource pack reason, rather than leaving
 * the client on its download screen until RakNet times it out.
 */
export default class ResourcePackChunkRequestHandler implements InputLaneHandler<ResourcePackChunkRequestPacket> {
    public static PacketName = 'ResourcePackChunkRequestPacket';
    public readonly phases = ['resourcePacks'] as const;
    // Input: the kick tears the player down and announces the departure to everyone.
    public readonly lane = 'input';

    /** Sends the chunk asked for, or disconnects a client that asked for one the server lacks. */
    public handle(packet: ResourcePackChunkRequestPacket, { session, log, services, step }: InputContext): undefined {
        const pack = services.resourcePacks.find(packet.resourceName);
        const chunk = pack === undefined ? undefined : chunkOf(pack, packet.chunk);
        if (pack === undefined || chunk === undefined) {
            log.debug(
                `${session.identity.name} requested chunk ${packet.chunk} of pack ${packet.resourceName}, which the server does not serve`
            );
            // The kick queues the goodbye and takes the player off in this input's unit; the step
            // lets the connection close without waiting for it.
            step.output(
                session.kick(
                    'Asked for a resource pack this server does not have',
                    DisconnectReason.RESOURCE_PACK_PROBLEM
                )
            );
            return;
        }
        const reply = new ResourcePackChunkDataPacket();
        reply.resourceName = packet.resourceName;
        reply.chunkId = packet.chunk;
        reply.byteOffset = BigInt(chunk.offset);
        reply.chunkData = Buffer.from(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength);
        step.output(session.getConnection().sendDataPacket(reply));
        if (packet.chunk === pack.chunkCount - 1)
            log.debug(
                `Sent ${session.identity.name} the last of ${pack.chunkCount} chunks of resource pack ${pack.resourceName}`
            );
    }
}
