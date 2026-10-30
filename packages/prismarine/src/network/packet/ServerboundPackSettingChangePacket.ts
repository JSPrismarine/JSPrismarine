import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/** A pack setting value, in the four shapes the `oneOf` allows. */
export type PackSettingValue = number | boolean | string | string[];

/** The `oneOf` selectors for {@link PackSettingValue}, in wire order. */
export enum PackSettingValueType {
    Float = 0,
    Bool = 1,
    String = 2,
    StringList = 3
}

/**
 * A change the player made in a pack's settings screen.
 *
 * Wire layout at protocol 2193: PackId as an `mce::UUID` (two uint64 LE halves),
 * PackSettingName as a string, then PackSettingValue as a `oneOf`: a varuint32 selector
 * (see {@link PackSettingValueType}) followed by a float LE, a boolean, a string, or a
 * varuint32 count of strings.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/serverbound-pack-setting-change-packet/
 */
export default class ServerboundPackSettingChangePacket extends DataPacket {
    public packId = new UUID();
    public packSettingName = '';

    /** The new value, or `null` before a decode. */
    public packSettingValue: PackSettingValue | null = null;

    /** Reads the pack, the setting name, and the selected value alternative. */
    public decodePayload(): void {
        this.packId = UUID.networkDeserialize(this);
        this.packSettingName = NetworkUtil.readString(this);

        const selector = this.readUnsignedVarInt();
        switch (selector) {
            case PackSettingValueType.Float:
                this.packSettingValue = this.readFloatLE();
                break;
            case PackSettingValueType.Bool:
                this.packSettingValue = this.readBoolean();
                break;
            case PackSettingValueType.String:
                this.packSettingValue = NetworkUtil.readString(this);
                break;
            case PackSettingValueType.StringList: {
                const count = this.readUnsignedVarInt();
                const values: string[] = [];
                for (let index = 0; index < count; index++) values.push(NetworkUtil.readString(this));
                this.packSettingValue = values;
                break;
            }
            default:
                throw new Error(`Unknown pack setting value alternative ${selector}`);
        }
    }

    /**
     * Writes the pack, the setting name, and the value with the selector its type implies.
     * @throws when no value has been set.
     */
    public encodePayload(): void {
        const value = this.packSettingValue;
        if (value === null) throw new Error('ServerboundPackSettingChangePacket has no value to encode');

        this.packId.networkSerialize(this);
        NetworkUtil.writeString(this, this.packSettingName);

        if (typeof value === 'number') {
            this.writeUnsignedVarInt(PackSettingValueType.Float);
            this.writeFloatLE(value);
        } else if (typeof value === 'boolean') {
            this.writeUnsignedVarInt(PackSettingValueType.Bool);
            this.writeBoolean(value);
        } else if (typeof value === 'string') {
            this.writeUnsignedVarInt(PackSettingValueType.String);
            NetworkUtil.writeString(this, value);
        } else {
            this.writeUnsignedVarInt(PackSettingValueType.StringList);
            this.writeUnsignedVarInt(value.length);
            for (const entry of value) NetworkUtil.writeString(this, entry);
        }
    }
}
