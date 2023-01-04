import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';
import type Skin from '../../utils/skin/Skin.js';
import UUID from '../../utils/UUID.js';

export default class PlayerSkinPacket extends DataPacket {
    public static NetID = Identifiers.PlayerSkinPacket;

    public uuid!: UUID;
    public newSkinName!: string;
    public oldSkinName!: string;
    public skin!: Skin;
    public trusted!: boolean;

    public decodePayload() {
        this.uuid = UUID.networkDeserialize(this);
        this.readRemaining();
        // TODO this.skin = this.readSkin();
        // this.newSkinName = this.readString();
        // this.oldSkinName = this.readString();
        // this.trusted = this.readBool();
    }
}
