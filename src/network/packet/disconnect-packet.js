const DataPacket = require('./packet').default;
const Identifiers = require('../Identifiers').default;


class DisconnectPacket extends DataPacket {
    static NetID = Identifiers.DisconnectPacket

    /** @type {boolean} */
    hideDiscconnectionWindow
    /** @type {string} */
    message

    encodePayload() {
        this.writeBool(this.hideDiscconnectionWindow);
        if (!this.hideDiscconnectionWindow) {
            this.writeString(this.message);
        }
    }
}
module.exports = DisconnectPacket;
