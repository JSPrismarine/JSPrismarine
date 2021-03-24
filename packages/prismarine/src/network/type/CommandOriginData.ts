import CommandOriginType from './CommandOriginType';
import PacketBinaryStream from '../PacketBinaryStream';
import UUID from '../../utils/UUID';

class CommandOriginData {
    public type!: number;
    public uuid!: UUID;
    public requestId!: string;
    public uniqueEntityId!: bigint;

    public static networkDeserialize(stream: PacketBinaryStream): CommandOriginData {
        const data = new CommandOriginData();
        data.type = stream.readUnsignedVarInt();
        data.uuid = UUID.networkDeserialize(stream);
        data.requestId = stream.readString();

        if (data.type === CommandOriginType.DevConsole || data.type === CommandOriginType.Test) {
            data.uniqueEntityId = stream.readVarLong();
        }

        return data;
    }
}

export default CommandOriginData;
