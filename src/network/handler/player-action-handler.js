const Player = require('../../player')
const Identifiers = require('../identifiers')
const LevelEventPacket = require('../packet/level-event')
const PlayerActionPacket = require('../packet/player-action')
const PlayerAction = require('../type/player-action')
const LevelEventType = require('../type/level-event-type')
const logger = require('../../utils/logger')

'use strict'

class PlayerActionHandler {
    static NetID = Identifiers.PlayerActionPacket

    /**
     * @param {PlayerActionPacket} packet 
     * @param {Player} player 
     */
    static handle(packet, player) {
        let pk
        switch (packet.action) {
            case PlayerAction.StartBreak:
                pk = new LevelEventPacket()
                pk.eventId = LevelEventType.BlockStartBreak
                pk.x = packet.x
                pk.y = packet.y
                pk.z = packet.z
                pk.data = 65535 / 5 * 20
                for (const [_, onlinePlayer] of player.getServer().players) {
                    onlinePlayer.sendDataPacket(pk)
                }
                break
            case PlayerAction.AbortBreak:
            case PlayerAction.StopBreak:
                pk = new LevelEventPacket()
                pk.eventId = LevelEventType.BlockStopBreak
                pk.x = packet.x
                pk.y = packet.y
                pk.z = packet.z
                pk.data = 0
                for (const [_, onlinePlayer] of player.getServer().players) {
                    onlinePlayer.sendDataPacket(pk)
                }     
                break
            case PlayerAction.ContinueBreak:
                pk = new LevelEventPacket()
                pk.eventId = LevelEventType.ParticlePunchBlock
                pk.x = packet.x
                pk.y = packet.y
                pk.z = packet.z
                pk.data = 7  // TODO: runtime ID
                for (const [_, onlinePlayer] of player.getServer().players) {
                    onlinePlayer.sendDataPacket(pk)
                }
                break 
            default:
                logger.debug(`Unknown PlayerAction: ${packet.action}`)
        }
    }
}
module.exports = PlayerActionHandler