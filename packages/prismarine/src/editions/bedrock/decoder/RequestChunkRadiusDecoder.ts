import type { RequestChunkRadiusPacket } from '@jsprismarine/protocol';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

import type { Intent } from '../../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/** A view distance request: the radius the client wants and the most it can render. */
export default class RequestChunkRadiusDecoder implements PacketDecoder<RequestChunkRadiusPacket, 'setViewDistance'> {
    public static readonly PacketName = 'RequestChunkRadiusPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['setViewDistance'] as const;

    /** Decodes the request as it came; the handler decides the grant. */
    public decode(packet: RequestChunkRadiusPacket, _view: DecodeView): readonly Intent<'setViewDistance'>[] {
        const request = packet.getPacketData();
        if (request === null) throw new PrismarineNetworkErrors.ChunkRadiusRequestNotDecoded();
        return [{ kind: 'setViewDistance', radius: request.radius, maxRadius: request.maxRadius }];
    }
}
