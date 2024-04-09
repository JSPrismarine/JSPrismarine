// import BinaryStream from '@jsprismarine/jsbinaryutils';
import CommandOriginType from './CommandOriginType';
import type { UUID } from '../../utils/UUID';

export default class CommandOriginData {
    public type!: number;
    public uuid!: UUID;
    public requestId!: string;
    public uniqueEntityId!: bigint;

    public static networkDeserialize(stream: any): CommandOriginData {
        const data = new CommandOriginData();
        data.type = stream.readUnsignedVarInt();
        // data.uuid = UUID.networkDeserialize(stream);
        // data.requestId = McpeUtil.readString(stream);

        // TODO: remove this trash networking code from here

        if (data.type === CommandOriginType.DevConsole || data.type === CommandOriginType.Test) {
            data.uniqueEntityId = stream.readVarLong();
        }

        return data;
    }
}
