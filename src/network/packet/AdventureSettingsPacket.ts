import Identifiers from '../Identifiers';
import DataPacket from './Packet';

export default class AdventureSettingsPacket extends DataPacket {
    static NetID = Identifiers.AdventureSettingsPacket;

    public flags: number = 0;
    public commandPermission: number = 0;
    public flags2: number = 0;
    public playerPermission: number = 0;
    public customFlags: number = 0;
    public entityId: bigint = BigInt(0);

    public encodePayload() {
        this.writeUnsignedVarInt(this.flags);
        this.writeUnsignedVarInt(this.commandPermission);
        this.writeUnsignedVarInt(this.flags2);
        this.writeUnsignedVarInt(this.playerPermission);
        this.writeUnsignedVarInt(this.customFlags);
        this.writeLLong(this.entityId);
    }

    public decodePayload() {
        this.flags = this.readUnsignedVarInt();
        this.commandPermission = this.readUnsignedVarInt();
        this.flags2 = this.readUnsignedVarInt();
        this.playerPermission = this.readUnsignedVarInt();
        this.customFlags = this.readUnsignedVarInt();
        this.entityId = this.readLLong();
    }
}
