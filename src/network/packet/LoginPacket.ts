import BinaryStream from '@jsprismarine/jsbinaryutils';
import Device from '../../utils/Device';
import Skin from '../../utils/skin/skin';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

const jwt_decode = require('jwt-decode');

export default class LoginPacket extends DataPacket {
    static NetID = Identifiers.LoginPacket;

    public XUID: string = '';
    public identity: string = '';
    public displayName: string = '';
    public protocol: number = 0;
    public identityPublicKey: string = '';

    public clientRandomId: number = 0;
    public serverAddress: string = '';
    public languageCode: string = '';

    public device: Device | null = null;
    public skin: Skin | null = null;

    public decodePayload() {
        this.protocol = this.readInt();

        let stream = new BinaryStream(this.read(this.readUnsignedVarInt()));
        let chainData = JSON.parse(stream.read(stream.readLInt()).toString());

        for (let chain of chainData.chain) {
            let decodedChain = jwt_decode(chain);

            if (decodedChain.extraData) {
                this.XUID = decodedChain.extraData.XUID;
                this.identity = decodedChain.extraData.identity;
                this.displayName = decodedChain.extraData.displayName;
            }

            this.identityPublicKey = decodedChain.identityPublicKey;
        }

        let decodedJWT = jwt_decode(stream.read(stream.readLInt()).toString());
        this.skin = Skin.fromJWT(decodedJWT);
        this.device = new Device({
            id: decodedJWT.DeviceId,
            os: decodedJWT.DeviceOS,
            model: decodedJWT.DeviceModel,
            inputMode: decodedJWT.CurrentInputMode,
            guiScale: decodedJWT.GuiScale
        });

        this.clientRandomId = decodedJWT.ClientRandomId;
        this.serverAddress = decodedJWT.ServerAddress;
        this.languageCode = decodedJWT.LanguageCode;
    }
}
