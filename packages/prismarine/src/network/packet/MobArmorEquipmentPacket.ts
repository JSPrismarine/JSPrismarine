import type { Item } from '../../item/Item';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * What an entity is wearing, all four pieces at once.
 *
 * Separate from `MobEquipmentPacket`, which carries one held item and names a slot; this one is
 * positional - helmet, chestplate, leggings, boots, in that order and always all of them. An empty
 * slot is an air stack rather than an omission, because the client reads four and would otherwise
 * read the next packet's bytes as the rest of the armour.
 *
 * The only way anybody but the wearer sees armour: `AddActorPacket` has no room for it, so this
 * has to follow an entity into view the same way its held item does.
 * @see https://github.com/pmmp/BedrockProtocol/blob/master/src/MobArmorEquipmentPacket.php
 */
export default class MobArmorEquipmentPacket extends DataPacket {
    public static NetID = Identifiers.MobArmorEquipmentPacket;

    public runtimeEntityId!: bigint;

    public head!: Item;
    public chest!: Item;
    public legs!: Item;
    public feet!: Item;

    /**
     * The off hand, which the protocol carries here rather than with the held item.
     *
     * Not armour by any reading, but it is what the packet holds and splitting it out would mean
     * inventing a second packet the client does not send.
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
}
