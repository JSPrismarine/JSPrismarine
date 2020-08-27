const Identifiers = require('../identifiers')
const ResourcePackResponsePacket = require('../packet/resource-pack-response')
const ResourcePackStatus = require('../type/resource-pack-status')
const BiomeDefinitionListPacket = require('../packet/biome-definition-list')
const AvailableActorIdentifiersPacket = require('../packet/available-actor-identifiers')
const ResourcePackStackPacket = require('../packet/resource-pack-stack')
const StartGamePacket = require('../packet/start-game')
const Player = require('../../player')
const logger = require('../../utils/logger')

'use strict'

class ResourcePackResponseHandler {
    static NetID = Identifiers.ResourcePackResponsePacket

    /**
     * @param {ResourcePackResponsePacket} packet 
     * @param {Player} player 
     */
    static handle(packet, player) {
        let pk
        if (packet.status === ResourcePackStatus.HaveAllPacks) {
            pk = new ResourcePackStackPacket()
            player.sendDataPacket(pk)
        } else if (packet.status === ResourcePackStatus.Completed) {
            pk = new StartGamePacket()
            pk.entityId = player.runtimeId
            pk.runtimeEntityId = player.runtimeId
            pk.gamemode = player.gamemode

            pk.levelId = player.getServer().defaultLevel.uniqueId
            pk.worldName = player.getServer().defaultLevel.name
            player.sendDataPacket(pk)

            player.sendDataPacket(new AvailableActorIdentifiersPacket())
            player.sendDataPacket(new BiomeDefinitionListPacket())
            
            player.sendAttributes(player.attributes.getDefaults())

            logger.info(`${player.name} is attempting to join with id ${player.runtimeId} from ${player.getAddress().address}:${player.getAddress().port}`)

            player.setNameTag(player.name)
            // TODO: always visible nametag
            player.sendMetadata()

            player.sendAvailableCommands()

            // First add
            player.addToPlayerList()
            // Then retrive other players
            if (player.getServer().players.size > 1) {
                player.sendPlayerList() 
            }
        }
    }
}
module.exports = ResourcePackResponseHandler