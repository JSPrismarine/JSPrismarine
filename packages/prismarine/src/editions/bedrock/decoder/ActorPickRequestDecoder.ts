import type ActorPickRequestPacket from '@jsprismarine/protocol/bedrock/packet/ActorPickRequestPacket';

import type { Intent } from '../../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/**
 * An actor pick. The packet names the actor by unique id, which this server gives every actor
 * equal to its runtime id. `Max Slots` is left out, as a block pick's is.
 */
export default class ActorPickRequestDecoder implements PacketDecoder<ActorPickRequestPacket, 'pickEntity'> {
    public static readonly PacketName = 'ActorPickRequestPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['pickEntity'] as const;

    /** Decodes the picked actor and the data flag. */
    public decode(packet: ActorPickRequestPacket, _view: DecodeView): readonly Intent<'pickEntity'>[] {
        return [{ kind: 'pickEntity', target: packet.actorId, withData: packet.withData }];
    }
}
