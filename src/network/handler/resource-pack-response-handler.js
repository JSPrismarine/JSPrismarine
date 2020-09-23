const Identifiers = require('../identifiers')
const ResourcePackResponsePacket = require('../packet/resource-pack-response')
const ResourcePackStatus = require('../type/resource-pack-status')
const BiomeDefinitionListPacket = require('../packet/biome-definition-list')
const AvailableActorIdentifiersPacket = require('../packet/available-actor-identifiers')
const ResourcePackStackPacket = require('../packet/resource-pack-stack')
const StartGamePacket = require('../packet/start-game')
const Player = require('../../player')
const logger = require('../../utils/logger')
const Prismarine = require('../../prismarine')

'use strict'

class ResourcePackResponseHandler {
    static NetID = Identifiers.ResourcePackResponsePacket

    /**
     * @param {ResourcePackResponsePacket} packet 
     * @param {Prismarine} server
     * @param {Player} player 
     */
    static handle(packet, server, player) {
        let pk
        if (packet.status === ResourcePackStatus.HaveAllPacks) {
            pk = new ResourcePackStackPacket()
            player.sendDataPacket(pk)
        } else if (packet.status === ResourcePackStatus.Completed) {
            pk = new StartGamePacket()
            pk.entityId = player.runtimeId
            pk.runtimeEntityId = player.runtimeId
            pk.gamemode = player.gamemode

            let world = player.getWorld()
            pk.levelId = world.uniqueId
            pk.worldName = world.name
            player.sendDataPacket(pk)

            player.sendDataPacket(new AvailableActorIdentifiersPacket())
            player.sendDataPacket(new BiomeDefinitionListPacket())
            
            player.sendAttributes(player.attributes.getDefaults())

            logger.info(
                `§b${player.name}§f is attempting to join with id §b${player.runtimeId}§f from ${player.getAddress().address}:${player.getAddress().port}`
            )

            player.setNameTag(player.name)
            // TODO: always visible nametag
            player.sendMetadata()

            player.sendAvailableCommands()

            // First add
            player.addToPlayerList()
            // Then retrive other players
            if (server.getOnlinePlayers().length > 1) {
                player.sendPlayerList() 
            }
        }
    }
}
module.exports = ResourcePackResponseHandler