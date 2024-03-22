import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import McpeUtil from '../NetworkUtil';

export default class UpdateSoftEnumPacket extends DataPacket {
    public static NetID = Identifiers.UpdateSoftEnumPacket;

    public TYPE_ADD = 0;
    public TYPE_REMOVE = 1;
    public TYPE_SET = 2;

    public enumName!: string;
    public values: string[] = [];
    public type!: number;

    public encodePayload() {
        McpeUtil.writeString(this, this.enumName);
        this.writeUnsignedVarInt(this.values.length);
        this.values.forEach((v) => {
            McpeUtil.writeString(this, v);
        });
        this.writeByte(this.type);
    }
}
