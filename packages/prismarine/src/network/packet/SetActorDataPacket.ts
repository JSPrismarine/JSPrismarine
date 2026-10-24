import type { Metadata } from '../../entity/Metadata';
import Identifiers from '../Identifiers';
import { SyncedProperties } from '../type/SyncedProperties';
import DataPacket from './DataPacket';

/**
 * Sends a delta of an entity's metadata to clients that can see it.
 *
 * Protocol 2193 layout, in order: `Target Runtime ID` as a varuint64, `Actor Data` as a
 * `SynchedActorDataList` (varuint32 count, then per `DataItemEntry` the `ID` as a varuint32,
 * the `Type` as one uint8 `DataItemType`, and the `Value` in that type's encoding), `Synched
 * Properties` as a `PropertySyncData` (int entries, then float entries), and `Tick` as a
 * varuint64. Server to client only.
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
     * Tick: the most recently processed `PlayerAuthInputPacket` tick of the receiving player, so
     * the client can reconcile its prediction. Zero is acceptable when the packet is not about the
     * receiving player or a vehicle they predict, and also for players at the cost of minor
     * visual flicker.
     */
    public tick: bigint = 0n;

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.metadata.networkSerialize(this);
        this.syncedProperties.networkSerialize(this);
        this.writeUnsignedVarLong(this.tick);
    }
}
