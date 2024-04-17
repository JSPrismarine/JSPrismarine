import UUID from '../../utils/UUID';
import type Skin from '../../utils/skin/Skin';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

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
        // TODO: this.skin = this.readSkin();
        // this.newSkinName = this.readString();
        // this.oldSkinName = this.readString();
        // this.trusted = this.readBool();
    }
}
