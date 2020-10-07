const Identifiers = require('../identifiers');
const PacketViolationWarningPacket = require('../packet/packet-violation-warning');

class PacketViolationWarningHandler {
    static NetID = Identifiers.PacketViolationWarningPacket

    /**
     * @param {PacketViolationWarningPacket} packet 
     * @param {Prismarine} server
     * @param {Player} player 
     */
    static handle(packet, server, player) {
        server.getLogger().error(`Packet violation: ${JSON.stringify(packet)}`);
    }
}
module.exports = PacketViolationWarningHandler;
