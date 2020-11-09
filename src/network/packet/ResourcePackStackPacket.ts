import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ResourcePackStackPacket extends DataPacket {
    static NetID = Identifiers.ResourcePackStackPacket;

    public mustAccept = false;
    public behaviorPackStack = [];
    public resourcePackStack = [];

    public encodePayload() {
        this.writeBool(+this.mustAccept);

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

        this.writeBool(+false); // experimental
        this.writeString(Identifiers.MinecraftVersion);
    }
}
