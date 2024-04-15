// import BinaryStream from '@jsprismarine/jsbinaryutils';
import { NetworkUtil } from '../../network/NetworkUtil';
import UUID from '../../utils/UUID';
import CommandOriginType from './CommandOriginType';

export default class CommandOriginData {
    public type!: number;
    public uuid!: UUID;
    public requestId!: string;
    public uniqueEntityId!: bigint;

    public static networkDeserialize(stream: any): CommandOriginData {
        const data = new CommandOriginData();
        data.type = stream.readUnsignedVarInt();
        data.uuid = UUID.networkDeserialize(stream);
        data.requestId = NetworkUtil.readString(stream);

        if (data.type === CommandOriginType.DevConsole || data.type === CommandOriginType.Test) {
            data.uniqueEntityId = stream.readVarLong();
        }

        return data;
    }
}
