/**
 * `SetActorDataPacket`: a delta of an entity's metadata, described as a declarative field
 * list; layout unchanged between protocols 2193 and 2225.
 *
 * This definition lives beside the class because `Metadata` and `SyncedProperties` are
 * prismarine-owned; it moves to `@jsprismarine/protocol`'s registry when they do.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-actor-data-packet/}
 */
import { definePacket, t } from '@jsprismarine/protocol';
import { metadata, syncedProperties } from '../wire/fieldTypes';

/** The `SetActorDataPacket` field list; the class doc carries the wire provenance. */
export const setActorDataPacket = definePacket('SetActorDataPacket', {
    /** `Target Runtime ID`: the entity whose data changed. */
    runtimeEntityId: t.varuint64,
    /** `Actor Data`: the metadata entries to send; only the entries in the map travel. */
    metadata,
    /** `Synched Properties`: the client-synced entity property values, int then float. */
    syncedProperties,
    /** `Tick`, a `PlayerInputTick`; see the class doc for what the server fills in. */
    tick: t.varuint64
});
