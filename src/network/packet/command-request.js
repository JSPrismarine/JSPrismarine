<<<<<<< HEAD
const DataPacket = require('./packet').default;
const Identifiers = require('../Identifiers').default;
const CommandOriginData = require('../type/CommandOriginData').default;
=======
const DataPacket = require('./Packet').default;
const Identifiers = require('../Identifiers').default;
const CommandOriginData = require('../type/command-origin-data');
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e


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
