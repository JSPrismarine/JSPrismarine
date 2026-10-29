import { Attribute } from '../../entity/Attribute';
import DataPacket from './DataPacket';

/**
 * Replaces some or all of one entity's attributes on the client, for instance after it takes
 * damage or eats. Only the attributes that changed need to be in the list.
 *
 * Protocol 2193 wire layout, in the field names Mojang's docs use:
 * - Target Runtime ID, a varuint64.
 * - Attribute List, a varuint32 count followed by one AttributeData per entry. Each entry is
 *   Min Value, Max Value, Current Value, Default Min Value, Default Max Value and Default Value
 *   as little-endian floats, then Name as a hashed_string, then Modifiers as a varuint32 count
 *   followed by one AttributeModifier each: Id string, Name string, Amount float, Operation
 *   int32, Operand int32, Is Serializable boolean.
 * - Tick, a PlayerInputTick, which is a varuint64.
 *
 * `Attribute.networkSerialize` writes each entry and `Attribute.networkDeserialize` reads one
 * back. The server sends the live bounds as the default bounds and an empty Modifiers list,
 * since it models no timed buffs. `PlayerSession.sendAttributesFor` fills Tick with the
 * client's last input tick for its own player and zero for any other entity.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/update-attributes-packet/
 */
export default class UpdateAttributesPacket extends DataPacket {
    public runtimeEntityId!: bigint;
    public attributes: Attribute[] = [];

    /**
     * The `PlayerInputTick`: the tick of the last `PlayerAuthInputPacket` the server handled
     * for this client, so it can line the update up with its own prediction. Zero when the
     * attributes are not the receiving player's, or before the client has sent any input.
     */
    public tick = 0n;

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);

        this.writeUnsignedVarInt(this.attributes.length);
        for (const attribute of this.attributes) {
            attribute.networkSerialize(this);
        }

        this.writeUnsignedVarLong(this.tick);
    }

    public decodePayload(): void {
        this.runtimeEntityId = this.readUnsignedVarLong();

        const length = this.readUnsignedVarInt();
        this.attributes = Array.from({ length }, () => Attribute.networkDeserialize(this));

        this.tick = this.readUnsignedVarLong();
    }
}
