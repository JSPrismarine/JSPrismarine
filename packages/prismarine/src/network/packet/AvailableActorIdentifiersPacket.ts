import { entity_identifiers } from '@jsprismarine/bedrock-data';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Every actor type the client may be asked to render, sent once at world start.
 *
 * Protocol 2193 carries a single field, `Identifier List`: one network NBT compound holding an
 * `idlist` of `ActorInfo` entries, each with `rid` (the runtime id, an int), `id` (the actor
 * identifier), `bid` (the base identifier), `hasspawnegg` and `summonable`. There is no length
 * prefix, so the compound runs to the end of the packet.
 *
 * This server defines no custom actors, so it replays vanilla's list: the payload a Bedrock
 * Dedicated Server 1.26.51.1 sends, recorded by `packages/client/tools/capture-server-data.mjs`.
 * A client that never receives it falls back to an empty table and cannot resolve the runtime
 * ids in `AddActorPacket`.
 *
 * **Bound To:** Client
 */
export default class AvailableActorIdentifiersPacket extends DataPacket {
    public static NetID = Identifiers.AvailableActorIdentifiersPacket;

    /** `Identifier List` as network NBT. Defaults to vanilla's. */
    public identifiers: Buffer = entity_identifiers;

    /** Writes `Identifier List`, which is the whole payload. */
    public encodePayload(): void {
        this.write(this.identifiers);
    }

    /** Reads `Identifier List`, which runs to the end of the packet. */
    public decodePayload(): void {
        this.identifiers = this.readRemaining();
    }
}
