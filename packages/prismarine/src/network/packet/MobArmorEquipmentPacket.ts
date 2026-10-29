import { Item } from '../../item/Item';
import DataPacket from './DataPacket';

/**
 * What an entity is wearing, all five pieces at once.
 *
 * Separate from `MobEquipmentPacket`, which carries one held item and names a slot; this one is
 * positional. Wire order at protocol 2193: Target Runtime ID, then Head, Torso, Legs, Feet and
 * Body, each a `NetworkItemStackDescriptor`. An empty slot is an air stack rather than an
 * omission, because the client reads five and would otherwise read the next packet's bytes as
 * the rest of the armor.
 *
 * The only way anybody but the wearer sees armor: `AddActorPacket` has no room for it, so this
 * has to follow an entity into view the same way its held item does.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/mob-armor-equipment-packet/
 */
export default class MobArmorEquipmentPacket extends DataPacket {
    public runtimeEntityId!: bigint;

    public head!: Item;
    public chest!: Item;
    public legs!: Item;
    public feet!: Item;

    /**
     * The body armor slot, the fifth piece worn by wolves, horses and similar mobs.
     *
     * Players have nothing to show here, so they send an air stack. It is not the off hand.
     */
    public body!: Item;

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);

        this.head.networkSerialize(this);
        this.chest.networkSerialize(this);
        this.legs.networkSerialize(this);
        this.feet.networkSerialize(this);
        this.body.networkSerialize(this);
    }

    /**
     * Reads the five slots back. The client never sends this packet; the reader is here so a
     * test can take the server's bytes apart with the same layout they were written in.
     */
    public decodePayload(): void {
        this.runtimeEntityId = this.readUnsignedVarLong();

        this.head = Item.networkDeserialize(this);
        this.chest = Item.networkDeserialize(this);
        this.legs = Item.networkDeserialize(this);
        this.feet = Item.networkDeserialize(this);
        this.body = Item.networkDeserialize(this);
    }
}
