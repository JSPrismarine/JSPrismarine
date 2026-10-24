import type { Metadata } from '../../entity/Metadata';
import Identifiers from '../Identifiers';
import { SyncedProperties } from '../type/SyncedProperties';
import DataPacket from './DataPacket';

/**
 * Sends a delta of an entity's metadata to clients that can see it.
 *
 * Protocol 2193 layout, in order: `Target Runtime ID` as a varuint64, `Actor Data` as a
 * `SynchedActorDataList` (varuint32 count, then per `DataItemEntry` the `ID` as a varuint32,
 * the payload's one-of selector as a varuint32, the same type again as the alternative's uint8
 * `Type`, and the `Value` in that type's encoding), `Synched Properties` as a
 * `PropertySyncData` (int entries, then float entries), and `Tick` as a varuint64. Server to
 * client only.
 */
export default class SetActorDataPacket extends DataPacket {
    public static NetID = Identifiers.SetActorDataPacket;

    /** Target Runtime ID of the entity whose data changed. */
    public runtimeEntityId!: bigint;
    /** Actor Data: the metadata entries to send. Only the entries present in the map are written. */
    public metadata!: Metadata;

    /** Synched Properties. Empty until the server defines entity properties. */
    public syncedProperties = new SyncedProperties();

    /**
     * `Tick`, a `PlayerInputTick`: the tick of the receiving player's most recently processed
     * `PlayerAuthInputPacket`, so the client can reconcile what it predicted while the packet
     * was in flight. `PlayerSession` sends its `lastInputTick` when the entity is the receiving
     * player and zero for any other entity, which is what the docs ask for.
     */
    public tick: bigint = 0n;

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.metadata.networkSerialize(this);
        this.syncedProperties.networkSerialize(this);
        this.writeUnsignedVarLong(this.tick);
    }
}
