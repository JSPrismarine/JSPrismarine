import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ResourcePackStackPacket extends DataPacket {
    static NetID = Identifiers.ResourcePackStackPacket;

    public mustAccept!: boolean;
    public behaviorPackStack = [];
    public resourcePackStack = [];

    public encodePayload() {
        this.writeBool(this.mustAccept);

        this.writeUnsignedVarInt(this.behaviorPackStack.length);
        for (let _behaviorPackStack of this.behaviorPackStack) {
            this.writeString('');
            this.writeString('');
            this.writeString('');
        }

        this.writeUnsignedVarInt(this.resourcePackStack.length);
        for (let _resourcePackStack of this.resourcePackStack) {
            this.writeString('');
            this.writeString('');
            this.writeString('');
        }

        this.writeString(Identifiers.MinecraftVersion);

        this.writeVarInt(0); // experimental count
        this.writeByte(0); // experiemnts toggled?
        this.writeByte(0); // allow holiday creator features
        this.writeByte(0); // allow creation of custom biomes
        this.writeByte(0); // allow additional modding capabilities
    }
}
