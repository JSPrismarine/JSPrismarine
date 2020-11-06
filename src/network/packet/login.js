const jwt_decode = require('jwt-decode');

const DataPacket = require('./Packet').default;
const Identifiers = require('../Identifiers').default;
const BinaryStream = require('@jsprismarine/jsbinaryutils').default;
const Skin = require('../../utils/skin/skin');
const Device = require('../../utils/device');

class LoginPacket extends DataPacket {
    static NetID = Identifiers.LoginPacket;

    /** @type {string} */
    XUID;
    /** @type {string} */
    identity;
    /** @type {string} */
    disaplayName;
    /** @type {number} */
    protocol;
    /** @type {string} */
    identityPublicKey;

    /** @type {number} */
    clientRandomId;
    /** @type {string} */
    serverAddress;
    /** @type {string} */
    languageCode;

    /** @type {Device} */
    device;
    /** @type {Skin} */
    skin;

    decodePayload() {
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
module.exports = LoginPacket;
