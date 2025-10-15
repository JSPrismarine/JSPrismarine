import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ResourcePackStackPacket extends DataPacket {
    public static NetID = Identifiers.ResourcePackStackPacket;

    public texturePackRequired!: boolean;
    public addonList = [];
    public texturePackList = [];

    // TODO: make a holder / manager
    public experiments: Map<string, boolean> = new Map();
    public experimentsAlreadyEnabled!: boolean;

    public encodePayload(): void {
        this.writeBoolean(this.texturePackRequired);

        this.writeUnsignedVarInt(this.addonList.length);
        for (const _behaviorPackStack of this.addonList) {
            NetworkUtil.writeString(this, '');
            NetworkUtil.writeString(this, '');
            NetworkUtil.writeString(this, '');
        }

        this.writeUnsignedVarInt(this.texturePackList.length);
        for (const _resourcePackStack of this.texturePackList) {
            NetworkUtil.writeString(this, '');
            NetworkUtil.writeString(this, '');
            NetworkUtil.writeString(this, '');
        }

        NetworkUtil.writeString(this, '*'); // Same as vanilla, should be the game version

        // TODO: write properly experiments
        this.writeUnsignedIntLE(0); // Experiments count

        this.writeBoolean(this.experimentsAlreadyEnabled); // Experiemnts previously toggled?

        this.writeBoolean(false); // Include editor packs
    }
}
