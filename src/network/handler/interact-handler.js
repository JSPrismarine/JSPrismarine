const Player = require('../../player')
const Identifiers = require('../identifiers')
const EventManager = require('../../events/event-manager')
const EventIdentifiers = require('../../events/event-identifiers')
const InteractPacket = require('../packet/interact')
const InteractAction = require('../type/interact-action')
const ContainerOpenPacket = require('../packet/container-open')
const logger = require('../../utils/logger')

'use strict'

class InteractHandler {
    static NetID = Identifiers.InteractPacket

    /**
     * @param {InteractPacket} packet 
     * @param {Player} player 
     */
    static handle(packet, player) {
        // TODO: event
        EventManager.emit(EventIdentifiers.PlayerInteractEvent, this)

        switch (packet.action) {
            case InteractAction.LeaveVehicle:
            case InteractAction.MouseOver:
                break
            case InteractAction.OpneInventory:
                let pk = new ContainerOpenPacket()
                pk.windowId = 1  // TODO
                pk.containerType = 1  // -> inventory (TODO)
                pk.containerX = pk.containerY = pk.containerZ = 0
                pk.containerEntityId = player.runtimeId
                player.sendDataPacket(pk)
                break
            default:
                logger.debug('Unknown interact action id: ' + packet.action)    
        }
    }
}
module.exports = InteractHandler