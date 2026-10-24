import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/** The docs' `SoftEnumUpdateType`: what to do with the values this packet carries. */
export enum SoftEnumUpdateType {
    /** Add the values to the enum the client already has. */
    ADD,
    /** Take the values out of it. */
    REMOVE,
    /** Throw away what the client has and use these instead. */
    REPLACE
}

/**
 * Changes one soft enum without resending every command.
 *
 * A soft enum is the one kind of command enum whose options may change while a client is
 * connected - player names and tags, mostly - so this exists to avoid sending the whole of
 * `AvailableCommandsPacket` again for each change.
 *
 * Wire order at protocol 2193: `Enum Name` (string), `Values` (a varuint count then that many
 * strings), `Update Type` (uint8, a {@link SoftEnumUpdateType}).
 *
 * **Bound To:** Client
 */
export default class UpdateSoftEnumPacket extends DataPacket {
    public static NetID = Identifiers.UpdateSoftEnumPacket;

    /** `Enum Name`: which enum this changes, as named in `AvailableCommandsPacket`. */
    public enumName!: string;

    /** `Values`: the options to add, remove, or replace the enum with. */
    public values: string[] = [];

    /** `Update Type`: what to do with {@link values}. */
    public type: SoftEnumUpdateType = SoftEnumUpdateType.ADD;

    /** Writes `Enum Name`, `Values` and `Update Type`. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.enumName);

        this.writeUnsignedVarInt(this.values.length);
        for (const value of this.values) NetworkUtil.writeString(this, value);

        this.writeByte(this.type);
    }
}
