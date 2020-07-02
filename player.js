const Entity = require("./entity")
const EncapsulatedPacket = require('jsraknet/protocol/encapsulated_packet')
const { PlayStatusPacket, Status } = require('./protocol/mcbe/play_status_packet')
const ResourcePacksInfoPacket = require('./protocol/mcbe/resource_packs_info_packet')
const BatchPacket = require("./protocol/mcbe/batch_packet")
const { ResourcePackStatus } = require('./protocol/mcbe/resource_pack_client_response_packet')
const ResourcePackStackPacket = require('./protocol/mcbe/resource_pack_stack_packet')
const StartGamePacket = require("./protocol/mcbe/start_game_packet")
const AvailableActorIdentifiersPacket = require("./protocol/mcbe/available_actor_identifiers_packet")
const ChunkRadiusUpdatedPacket = require('./protocol/mcbe/chunk_radius_updated_packet')
const Chunk = require('./level/chunk')
const LevelChunkPacket = require("./protocol/mcbe/level_chunk_packet")
const BiomeDefinitionListPacket = require('./protocol/mcbe/biome_definition_list_packet')

'use strict'

class Player extends Entity {

    #connection

    #address
    #name
    #locale 
    #runtimeId
    // TODO, UUID class and converter  
    #uuid
    #xuid
    #skin

    #viewDistance

    // Device
    #deviceOS
    #deviceModel
    #deviceId

    constructor(connection, address) {
        super()
        this.#connection = connection
        this.#address = address
    }

    handleDataPacket(packet) {
        let pk
        switch (packet.id) {
            case 0x01:  // Login 
                this.#name = packet.displayName
                this.#locale = packet.languageCode
                this.#runtimeId = packet.randomClientId
                this.#uuid = packet.identity

                this.#deviceId = packet.deviceId
                this.#deviceOS = packet.deviceOS
                this.#deviceModel = packet.deviceModel
                
                this.#skin = packet.skin

                this.sendPlayStatus(Status.LoginSuccess)

                pk = new ResourcePacksInfoPacket()
                this.sendDataPacket(pk)
                break
            case 0x08:  // Resource pack client response    
                if (packet.status === ResourcePackStatus.HaveAllPacks) {
                    pk = new ResourcePackStackPacket()
                    this.sendDataPacket(pk)
                } else if (packet.status === ResourcePackStatus.Completed) {
                    console.log('Completed!')
                    pk = new StartGamePacket()
                    this.sendDataPacket(pk)

                    this.sendDataPacket(new AvailableActorIdentifiersPacket())
                    this.sendDataPacket(new BiomeDefinitionListPacket())
                }
               break
            case 0x9c:
                console.log(packet)
                break   
            case 0x45:
                pk = new ChunkRadiusUpdatedPacket()
                pk.radius = packet.radius
                this.sendDataPacket(pk)

                // Update player vieww distance
                this.#viewDistance = pk.radius

                new Promise((resolve, reject) => {
                    setImmediate(() => {
                        try {
                            resolve(() => {
                                let distance = this.#viewDistance
                                for (let chunkX = -distance; chunkX <= distance; chunkX++) {
                                    for (let chunkZ = -distance; chunkZ <= distance; chunkZ++) {
                                        let chunk = new Chunk()
                        
                                        for (let x = 0; x < 16; x++) {
                                            for (let z = 0; z < 16; z++) {
                                                let y = 0;
                                                chunk.setBlockId(x, y++, z, 7)
                                                chunk.setBlockId(x, y++, z, 3)
                                                chunk.setBlockId(x, y++, z, 3)
                                                chunk.setBlockId(x, y, z, 2)
                                            
                                                // TODO: block light
                                            }
                                        }
                        
                                        chunk.recalculateHeightMap()
                                        this.sendChunk(chunk)
                                    }
                                }
                            })
                        } catch (e) {
                            reject(e)
                        }
                    })
                }).then(() => {
                    console.log('Done sending chunks')
                    this.sendPlayStatus(Status.PlayerSpawn)
                }) 
                break    
        }
    }

    /**
     * @param {Chunk} chunk 
     */
    sendChunk(chunk) {
        let pk = new LevelChunkPacket()
        pk.chunkX = chunk.chunkX
        pk.chunkZ = chunk.chunkZ
        pk.subChunkCount = chunk.getSubChunkSendCount()
        pk.data = chunk.toBinary()
        this.sendDataPacket(pk)
    }

    /**
     * @param {number} status 
     */
    sendPlayStatus(status) {
        let pk = new PlayStatusPacket()
        pk.status = status
        this.sendDataPacket(pk)
    }

    // To refactor
    sendDataPacket(packet, _needACK = false, _immediate = false) {
        let batch = new BatchPacket()
        batch.addPacket(packet)
        batch.encode()

        // Add this in raknet
        let sendPacket = new EncapsulatedPacket()
        sendPacket.reliability = 0
        sendPacket.buffer = batch.buffer

        this.#connection.addEncapsulatedToQueue(sendPacket)
    }

}
module.exports = Player