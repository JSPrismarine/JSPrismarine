import { NBTTagCompound } from '@jsprismarine/nbt';
import { layoutAt, syncActorPropertyPacket } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * The actor properties a client is allowed to see, for one actor type.
 *
 * Bound to the client. Actor properties are the replacement Mojang intends for synched actor
 * data, and this packet carries the ones flagged for client sync.
 *
 * Wire order at protocol 2193: Property Data as one network NBT compound and nothing else.
 * The compound holds `type`, the actor identifier, and `properties`, a list of property
 * definitions flagged for client sync. Each definition carries its name, type, and enum values
 * or numeric range when applicable.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/sync-actor-property-packet/
 */
export default class SyncActorPropertyPacket extends FieldNetworkPacket {
    /** Property Data: the actor type and its synced properties. */
    public propertyData: NBTTagCompound = new NBTTagCompound();

    /** Reads the property compound. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(syncActorPropertyPacket, this.codecProtocol).decode(this));
    }

    /** Writes the property compound. */
    public encodePayload(): void {
        layoutAt(syncActorPropertyPacket, this.codecProtocol).encode(this, this);
    }
}
