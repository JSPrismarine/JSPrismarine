import type ActorEventPacket from '@jsprismarine/protocol/bedrock/packet/ActorEventPacket';
import { ActorEvent } from '@jsprismarine/protocol/bedrock/packet/ActorEventPacket';

import type { Intent } from '../../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/**
 * A client reporting something that happened to its own player.
 *
 * A client may only speak for itself, and only with the events vanilla sends: `FEED` goes out
 * when the player starts eating, with the item's network id as `Data`, and the other sixty
 * events only travel from server to client. An event that names another actor, or one of the
 * server-only events, is dropped: relaying it would let a client play any animation on any
 * entity it can see. A vanilla client echoes a `FEED` it was sent about another player back to
 * the server, so an event about another actor is a normal sight and is logged at verbose level.
 */
export default class ActorEventDecoder implements PacketDecoder<ActorEventPacket, 'eat'> {
    public static readonly PacketName = 'ActorEventPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['eat'] as const;

    /** Decodes a `FEED` about the sender; everything else is dropped. */
    public decode(packet: ActorEventPacket, view: DecodeView): readonly Intent<'eat'>[] {
        if (packet.runtimeEntityId !== view.runtimeId) {
            view.log.verbose(
                `Dropped actor event ${packet.event} from ${view.name}: it names actor ${packet.runtimeEntityId}, not the sender`
            );
            return [];
        }

        if (packet.event !== ActorEvent.FEED) {
            view.log.verbose(`Dropped actor event ${packet.event} from ${view.name}: a client does not send it`);
            return [];
        }

        return [{ kind: 'eat', item: packet.data }];
    }
}
