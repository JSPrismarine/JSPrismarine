<<<<<<< HEAD
const DataPacket = require('./packet').default;
const Identifiers = require('../Identifiers').default;
const InteractAction = require('../type/InteractAction').default;
=======
const DataPacket = require('./Packet').default;
const Identifiers = require('../Identifiers').default;
const InteractAction = require('../type/interact-action');
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e


class InteractPacket extends DataPacket {
    static NetID = Identifiers.InteractPacket

    /** @type {number} */
    action
    /** @type {number} */
    target

    /** @type {number|null} */
    x = null
    /** @type {number|null} */
    y = null
    /** @type {number|null} */
    z = null

    decodePayload() {
        this.action = this.readByte();
        this.target = this.readUnsignedVarLong();

        if (this.action == InteractAction.MouseOver) {
            this.x = this.readLFloat();
            this.y = this.readLFloat();
            this.z = this.readLFloat();
        }
    }
}
module.exports = InteractPacket;
