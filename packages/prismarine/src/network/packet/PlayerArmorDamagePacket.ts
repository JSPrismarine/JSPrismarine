import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/** A piece of armor, as the Armor Slot varint32 of an `ArmorSlotAndDamagePair` numbers it. */
export enum ArmorSlot {
    Head = 0,
    Torso = 1,
    Legs = 2,
    Feet = 3,
    Body = 4
}

/** The damage to apply to one piece of armor. */
export interface ArmorSlotAndDamagePair {
    /** Armor Slot, a ZigZag varint32. */
    armorSlot: ArmorSlot;
    /** Damage, an int16 in little-endian byte order, added to the durability already used. */
    damage: number;
}

/**
 * Durability taken off a player's armor.
 *
 * Bound to the client. It saves sending a whole inventory slot for a change of a few points
 * of durability, so the server sends it whenever worn armor absorbs a hit.
 *
 * Wire order at protocol 2193: Armor Slot and Damage Pairs as a varuint32 count followed by
 * that many pairs of Armor Slot (ZigZag varint32, see {@link ArmorSlot}) and Damage (int16 in
 * little-endian byte order). Up to protocol 1001 this packet was a slot bit set followed by
 * one ZigZag varint32 per set bit; at 2193 it is the counted list below.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/player-armor-damage-packet/
 */
export default class PlayerArmorDamagePacket extends DataPacket {
    public static NetID = Identifiers.PlayerArmorDamagePacket;

    /** Armor Slot and Damage Pairs: one entry per piece that took damage. */
    public armorSlotAndDamagePairs: ArmorSlotAndDamagePair[] = [];

    /** Reads the pair count and each slot and damage pair. */
    public decodePayload(): void {
        const count = this.readUnsignedVarInt();

        this.armorSlotAndDamagePairs = [];
        for (let index = 0; index < count; index++) {
            this.armorSlotAndDamagePairs.push({ armorSlot: this.readVarInt(), damage: this.readShortLE() });
        }
    }

    /** Writes the pair count and each slot and damage pair. */
    public encodePayload(): void {
        this.writeUnsignedVarInt(this.armorSlotAndDamagePairs.length);

        for (const pair of this.armorSlotAndDamagePairs) {
            this.writeVarInt(pair.armorSlot);
            this.writeShortLE(pair.damage);
        }
    }
}
