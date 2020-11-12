import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class AdventureSettingsPacket extends DataPacket {
    static NetID = Identifiers.AdventureSettingsPacket;

    public flags!: number;
    public commandPermission!: number;
    public flags2!: number;
    public playerPermission!: number;
    public customFlags!: number;
    public entityId!: bigint;

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
