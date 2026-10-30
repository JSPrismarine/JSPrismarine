import { AbilityLayerFlag } from '@jsprismarine/minecraft';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/** Which of the two value slots in a `RequestAbilityPacket` carries the request. */
export enum RequestAbilityValueType {
    Unset = 0,
    Bool = 1,
    Float = 2
}

/**
 * The client asking to change one of its own abilities, such as toggling flight.
 *
 * Wire layout at protocol 2193: Ability as a ZigZag varint32 (an `AbilitiesIndex`, which the
 * schema constrains to 0 through 19), Value Type as a uint8, then both a boolean and a float
 * LE. Only the slot named by the value type is meaningful; the other is sent as its zero
 * value.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/request-ability-packet/
 */
export default class RequestAbilityPacket extends FieldNetworkPacket {
    /** The ability being changed, see `AbilityLayerFlag`. */
    public ability = AbilityLayerFlag.INVALID;

    /** Which value slot holds the request. */
    public valueType = RequestAbilityValueType.Unset;

    /** The requested flag when {@link valueType} is `Bool`. */
    public boolValue = false;

    /** The requested number when {@link valueType} is `Float`. */
    public floatValue = 0;

    /** Reads the ability, the value type, and both value slots. */
    public decodePayload(): void {
        this.ability = this.readVarInt();
        this.valueType = this.readByte();
        this.boolValue = this.readBoolean();
        this.floatValue = this.readFloatLE();
    }

    /** Writes the ability, the value type, and both value slots. */
    public encodePayload(): void {
        this.writeVarInt(this.ability);
        this.writeByte(this.valueType);
        this.writeBoolean(this.boolValue);
        this.writeFloatLE(this.floatValue);
    }
}
