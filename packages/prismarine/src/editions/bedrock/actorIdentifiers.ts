/**
 * The actor list a joining client is sent: which actor types it may be asked to draw.
 */
import AvailableActorIdentifiersPacket from '@jsprismarine/protocol/bedrock/packet/AvailableActorIdentifiersPacket';

import type { ServerContent } from '../../content/ServerContent';
import { INERT_ACTOR } from '../../entity/data/storeActors';
import { withPackActorTypes } from '../../network/codec/actorTypes';

/**
 * The join's actor list: the codec's captured vanilla list, with the content's pack types after
 * it, as BDS sends them. The join cache keeps one per content and codec.
 * @param vanilla - The session codec's captured list.
 * @param content - The server's content, whose entity registry holds the pack types.
 */
export const actorIdentifiersFor = (
    vanilla: Buffer | undefined,
    content: ServerContent | undefined
): AvailableActorIdentifiersPacket => {
    const packet = new AvailableActorIdentifiersPacket();
    if (vanilla === undefined || content === undefined) return packet;
    const types = [...content.entities.registry.values()]
        // A stand-in for a saved actor no pack declares, which the client draws as that actor.
        .filter((type) => type.identifier !== INERT_ACTOR)
        .map(({ identifier, entity: { description } }) => ({
            identifier,
            isSpawnable: description.isSpawnable,
            isSummonable: description.isSummonable,
            ...(description.runtimeIdentifier === undefined ? {} : { runtimeIdentifier: description.runtimeIdentifier })
        }));
    const identifiers = withPackActorTypes(vanilla, types);
    if (identifiers !== vanilla) packet.identifiers = identifiers;
    return packet;
};
