const winston = require('winston')

const Connection = require('jsraknet/connection')
const Entity = require('./entity')
const EncapsulatedPacket = require('jsraknet/protocol/encapsulated_packet')
const { PlayStatusPacket, Status } = require('./protocol/mcbe/play_status_packet')
const ResourcePacksInfoPacket = require('./protocol/mcbe/resource_packs_info_packet')
const BatchPacket = require("./protocol/mcbe/batch_packet")
const { ResourcePackStatus } = require('./protocol/mcbe/resource_pack_client_response_packet')
const ResourcePackStackPacket = require('./protocol/mcbe/resource_pack_stack_packet')
const StartGamePacket = require("./protocol/mcbe/start_game_packet")
const AvailableActorIdentifiersPacket = require('./protocol/mcbe/available_actor_identifiers_packet')
const ChunkRadiusUpdatedPacket = require('./protocol/mcbe/chunk_radius_updated_packet')
const Chunk = require('./level/chunk')
const LevelChunkPacket = require("./protocol/mcbe/level_chunk_packet")
const BiomeDefinitionListPacket = require('./protocol/mcbe/biome_definition_list_packet')
const Identifiers = require("./protocol/identifiers")

'use strict'

class Player extends Entity {

    /** @type {Connection} */
    #connection
    /** @type {winston.Logger} */
    #logger
    #address

    name
    locale 
    randomId

    // TODO, UUID class and converter  
    uuid
    xuid
    skin

    viewDistance
    gamemode = 0

    pitch = 0
    yaw = 0
    headYaw = 0

    onGround = false

    // Device
    #deviceOS
    #deviceModel
    #deviceId

    constructor(connection, address, logger) {
        super()
        this.#connection = connection
        this.#address = address
        this.#logger = logger
    }

    handleDataPacket(packet) {
        let pk
        switch (packet.id) {
            case Identifiers.LoginPacket:  
                this.name = packet.displayName
                this.locale = packet.languageCode
                this.randomId = packet.clientRandomId
                this.uuid = packet.identity
                this.xuid = packet.XUID

                this.#deviceId = packet.deviceId
                this.#deviceOS = packet.deviceOS
                this.#deviceModel = packet.deviceModel
                
                this.skin = packet.skin

                this.sendPlayStatus(Status.LoginSuccess)

                pk = new ResourcePacksInfoPacket()
                this.sendDataPacket(pk)
                break
            case Identifiers.ResourcePackClientResponsePacket:  
                if (packet.status === ResourcePackStatus.HaveAllPacks) {
                    pk = new ResourcePackStackPacket()
                    this.sendDataPacket(pk)
                } else if (packet.status === ResourcePackStatus.Completed) {
                    pk = new StartGamePacket()
                    pk.entityId = this.runtimeId
                    pk.runtimeEntityId = this.runtimeId
                    // pk.playerGamemode = this.gamemode
                    // pk.playerX = this.x
                    // pk.playerY = this.y
                    // pk.playerZ = this.z
                    // pk.playerPitch = this.#pitch
                    // pk.playerYaw = this.#yaw
                    this.sendDataPacket(pk)

                    this.sendDataPacket(new AvailableActorIdentifiersPacket())
                    this.sendDataPacket(new BiomeDefinitionListPacket())

                    this.#logger.log({
                        level: 'info',
                        message: `${this.name} is attempting to join with id ${this.runtimeId} from ${this.#address.address}:${this.#address.port}`
                    })
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
                this.viewDistance = pk.radius

                // Send chunks
                new Promise((resolve, reject) => {
                    setImmediate(() => {
                        try {
                            resolve(() => {
                                let distance = this.viewDistance
                                for (let chunkX = -distance; chunkX <= distance; chunkX++) {
                                    for (let chunkZ = -distance; chunkZ <= distance; chunkZ++) {
                                        let chunk = new Chunk(chunkX, chunkZ)
                        
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
                    this.sendPlayStatus(Status.PlayerSpawn)
                }) 
                break
            case Identifiers.MovePlayerPacket:
                this.x = packet.positionX
                this.y = packet.positionY
                this.z = packet.positionZ
                this.pitch = packet.pitch
                this.yaw = packet.yaw 
                this.headYaw = packet.headYaw
                this.onGround = packet.onGround
                // We still have some fileds 
                // at the moment we don't need them
                break   
            case 0x7b:  // Level sound event packet
                // console.log(packet)
                break   
            case Identifiers.TextPacket:
                console.log(`${packet.sourceName} > ${packet.message}`)  
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