const Player = require('../../player')
const Identifiers = require('../identifiers')
const ContainerClosePacket = require('../packet/container-close')

'use strict'

class ContainerCloseHandler {
    static NetID = Identifiers.ContainerClosePacket

    /**
     * @param {ContainerClosePacket} packet 
     * @param {Player} player 
     */
    static handle(packet, player) {
        let pk = new ContainerClosePacket()
        pk.windowId = packet.windowId
        player.sendDataPacket(pk)

        // TODO: event
    }
}
module.exports = ContainerCloseHandler