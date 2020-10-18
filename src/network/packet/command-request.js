const DataPacket = require('./packet').default;
const Identifiers = require('../Identifiers').default;
const CommandOriginData = require('../type/CommandOriginData').default;


class CommandRequestPacket extends DataPacket {
    static NetID = Identifiers.CommandRequestPacket

    /** @type {String} */
    commandName
    /** @type {CommandOriginData} */
    commandOriginData
    /** @type {boolean} */
    internal

    decodePayload() {
        this.commandName = this.readString();
        this.commandOriginData = this.readCommandOriginData();
        this.internal = this.readBool();
    }
    
}
module.exports = CommandRequestPacket;
