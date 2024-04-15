import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class UpdateSoftEnumPacket extends DataPacket {
    public static NetID = Identifiers.UpdateSoftEnumPacket;

    public TYPE_ADD = 0;
    public TYPE_REMOVE = 1;
    public TYPE_SET = 2;

    public enumName!: string;
    public values: string[] = [];
    public type!: number;

    public encodePayload() {
        NetworkUtil.writeString(this, this.enumName);
        this.writeUnsignedVarInt(this.values.length);
        this.values.forEach((v) => {
            NetworkUtil.writeString(this, v);
        });
        this.writeByte(this.type);
    }
}
