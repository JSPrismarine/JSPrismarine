import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import McpeUtil from '../NetworkUtil';

export default class ResourcePackStackPacket extends DataPacket {
    public static NetID = Identifiers.ResourcePackStackPacket;

    public mustAccept!: boolean;
    public behaviorPackStack = [];
    public resourcePackStack = [];

    // TODO: make a holder / manager
    public experiments: Map<string, boolean> = new Map();
    public experimentsAlreadyEnabled!: boolean;

    public encodePayload() {
        this.writeBoolean(this.mustAccept);

        this.writeUnsignedVarInt(this.behaviorPackStack.length);
        for (const _behaviorPackStack of this.behaviorPackStack) {
            McpeUtil.writeString(this, '');
            McpeUtil.writeString(this, '');
            McpeUtil.writeString(this, '');
        }

        this.writeUnsignedVarInt(this.resourcePackStack.length);
        for (const _resourcePackStack of this.resourcePackStack) {
            McpeUtil.writeString(this, '');
            McpeUtil.writeString(this, '');
            McpeUtil.writeString(this, '');
        }

        McpeUtil.writeString(this, '*'); // Same as vanilla, should be the game version

        // TODO: write properly experiments
        this.writeUnsignedIntLE(0); // Experiments count

        this.writeBoolean(this.experimentsAlreadyEnabled); // Experiemnts previously toggled?
    }
}
