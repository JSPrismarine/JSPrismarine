import { entity_identifiers } from '@jsprismarine/bedrock-data';
import { availableActorIdentifiersPacket, layoutAt } from '@jsprismarine/protocol';

import DataPacket from './DataPacket';

/**
 * Every actor type the client may be asked to render, sent once at world start.
 *
 * Protocol 2193 carries a single field, `Identifier List`: one network NBT compound holding an
 * `idlist` of `ActorInfo` entries, each with `rid` (the runtime id, an int), `id` (the actor
 * identifier), `bid` (the base identifier), `hasspawnegg` and `summonable`. There is no length
 * prefix, so the compound runs to the end of the packet.
 *
 * This server defines no custom actors, so it replays vanilla's list: CloudburstMC's dump of the
 * compound a 1.26.50 server sends (`entity_identifiers.dat` in the `bedrock-data` resources
 * submodule), which shares protocol 2193 with 1.26.51. A client that never receives it falls
 * back to an empty table and cannot resolve the runtime ids in `AddActorPacket`.
 *
 * The wire layout is the `availableActorIdentifiersPacket` definition in the protocol package.
 *
 * **Bound To:** Client
 */
export default class AvailableActorIdentifiersPacket extends DataPacket {
    /** `Identifier List` as network NBT. Defaults to vanilla's. */
    public identifiers: Buffer = entity_identifiers;

    /** Writes `Identifier List`, which is the whole payload. */
    public encodePayload(): void {
        layoutAt(availableActorIdentifiersPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads `Identifier List`, which runs to the end of the packet. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(availableActorIdentifiersPacket, this.codecProtocol).decode(this));
    }
}
