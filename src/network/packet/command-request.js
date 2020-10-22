const DataPacket = require('./Packet').default;
const Identifiers = require('../identifiers');
const CommandOriginData = require('../type/command-origin-data');


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
