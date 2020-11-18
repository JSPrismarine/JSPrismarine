import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ResourcePackStackPacket extends DataPacket {
    static NetID = Identifiers.ResourcePackStackPacket;

    public mustAccept!: boolean;
    public behaviorPackStack = [];
    public resourcePackStack = [];

    // TODO: make a holder / manager
    public experiments: Map<string, boolean> = new Map();
    public experimentsAlreadyEnabled!: boolean;

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

        this.writeLInt(this.experiments.size); // experiments count
        this.writeBool(this.experimentsAlreadyEnabled); // experiemnts previously toggled?
    }
}
