import Identifiers from "../Identifiers";
import DataPacket from "./Packet";

export default class AdventureSettingsPacket extends DataPacket {
    static NetID = Identifiers.AdventureSettingsPacket
    flags = 0;
    commandPermission = 0;
    flags2 = 0;
    playerPermission = 0;
    customFlags = 0;
    entityId = BigInt(0);

    encodePayload() {
        this.writeUnsignedVarInt(this.flags);
        this.writeUnsignedVarInt(this.commandPermission);
        this.writeUnsignedVarInt(this.flags2);
        this.writeUnsignedVarInt(this.playerPermission);
        this.writeUnsignedVarInt(this.customFlags);
        this.writeLLong(this.entityId);
    }

    decodePayload() {
        this.flags = this.readUnsignedVarInt();
        this.commandPermission = this.readUnsignedVarInt();
        this.flags2 = this.readUnsignedVarInt();
        this.playerPermission = this.readUnsignedVarInt();
        this.customFlags = this.readUnsignedVarInt();
        this.entityId = this.readLLong();
    }
};
