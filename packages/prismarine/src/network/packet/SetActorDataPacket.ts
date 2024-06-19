import type { Metadata } from '../../entity/Metadata';
import Identifiers from '../Identifiers';
import { SyncedProperties } from '../type/SyncedProperties';
import DataPacket from './DataPacket';

export default class SetActorDataPacket extends DataPacket {
    public static NetID = Identifiers.SetActorDataPacket;

    public runtimeEntityId!: bigint;
    public metadata!: Metadata;

    public syncedProperties = new SyncedProperties();

    public tick!: bigint;

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.metadata.networkSerialize(this);
        this.syncedProperties.networkSerialize(this);
        this.writeUnsignedVarLong(this.tick);
    }
}
