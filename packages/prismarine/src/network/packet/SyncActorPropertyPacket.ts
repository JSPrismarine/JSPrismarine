import { ByteOrder, NBTTagCompound } from '@jsprismarine/nbt';

import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * The actor properties a client is allowed to see, for one actor type.
 *
 * Bound to the client. Actor properties are the replacement Mojang intends for synched actor
 * data, and this packet carries the ones flagged for client sync.
 *
 * Wire order at protocol 2193: Property Data as one network NBT compound and nothing else.
 * The compound holds `type`, the hash of the actor identifier, and `properties`, a
 * sub-compound of the properties themselves.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/sync-actor-property-packet/
 */
export default class SyncActorPropertyPacket extends DataPacket {
    public static NetID = Identifiers.SyncActorPropertyPacket;

    /** Property Data: the actor type and its synced properties. */
    public propertyData: NBTTagCompound = new NBTTagCompound();

    /** Reads the property compound. */
    public decodePayload(): void {
        this.propertyData = NBTTagCompound.readFromStream(this, ByteOrder.LITTLE_ENDIAN, true);
    }

    /** Writes the property compound. */
    public encodePayload(): void {
        this.propertyData.writeToStream(this, ByteOrder.LITTLE_ENDIAN, true);
    }
}
