import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * Tells a client how much damage its armor took, and leaves the client to apply it.
 *
 * **Bound To:** Client
 *
 * The client works out the durability loss itself from Damage and from the enchantments on
 * the pieces named in Armor Slots. Mojang is phasing the packet out: a server running the
 * item stack net manager updates the armor itself and never sends this.
 *
 * Protocol 2193 layout (docs id 38), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Cause | varint32 | A `SharedTypes::Legacy::ActorDamageCause` number |
 * | Damage | varint32 | Damage points dealt to the wearer, not to the armor |
 * | Armor Slots | varuint64 | A bitset, one bit per armor slot |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/hurt-armor-packet/
 */
export default class HurtArmorPacket extends FieldNetworkPacket {
    /**
     * Cause, the damage cause that produced the hit, as a `SharedTypes::Legacy::ActorDamageCause`
     * number. Mojang's datagen snapshot numbers its 35 members consecutively from `Override` (0)
     * to `MaceSmash` (34); this repository does not generate the enum.
     */
    public cause = 0;

    /** Damage, in damage points dealt to the wearer. The client derives the durability loss. */
    public damage = 0;

    /** Armor Slots, a bitset whose set bits are the slots to damage. */
    public armorSlots = 0n;

    /** Reads the cause, the damage, and the affected slots. */
    public decodePayload(): void {
        this.cause = this.readVarInt();
        this.damage = this.readVarInt();
        this.armorSlots = this.readUnsignedVarLong();
    }

    /** Writes the cause, the damage, and the affected slots. */
    public encodePayload(): void {
        this.writeVarInt(this.cause);
        this.writeVarInt(this.damage);
        this.writeUnsignedVarLong(this.armorSlots);
    }
}
