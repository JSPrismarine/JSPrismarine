const winston = require('winston')
const { Worker, parentPort, workerData } = require('worker_threads');

const Connection = require('jsraknet/connection')
const Async = require('./utils/async')
const Entity = require('./entity/entity')
const EncapsulatedPacket = require('jsraknet/protocol/encapsulated_packet')
const InetAddress = require('jsraknet/utils/inet_address')
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
const Skin = require('./utils/skin')
const UUID = require('./utils/uuid')
const Prismarine = require('./prismarine')
const { PlayerListPacket, PlayerListAction, PlayerListEntry } = require('./protocol/mcbe/player_list_packet')
const AddPlayerPacket = require('./protocol/mcbe/add_player_packet')
const { MovePlayerPacket, MovementMode } = require('./protocol/mcbe/move_player_packet')
const { TextType, TextPacket } = require('./protocol/mcbe/text_packet')
const RemoveActorPacket = require('./protocol/mcbe/remove_actor_packet')
const NetworkChunkPublisherUpdatePacket = require('./protocol/mcbe/network_chunk_publisher_update_packet')
const CoordinateUtils = require('./level/coordinate_utils')
const EventManager = require('./events/event_manager')
const UpdateAttributesPacket = require('./protocol/mcbe/update_attributes_packet')
const SetActorDataPacket = require('./protocol/mcbe/set_actor_data_packet')

'use strict'

class Player extends Entity {

    /** @type {Connection} */
    #connection
    /** @type {Prismarine} */
    #server
    /** @type {winston.Logger} */
    #logger
    /** @type {InetAddress} */
    #address

    /** @type {string} */
    name
    /** @type {string} */
    locale 
    /** @type {number} */
    randomId

    /** @type {string} */
    uuid
    /** @type {string} */
    xuid
    /** @type {Skin} */
    skin

    /** @type {number} */
    viewDistance
    /** @type {number} */
    gamemode = 0

    /** @type {number} */
    pitch = 0
    /** @type {number} */
    yaw = 0
    /** @type {number} */
    headYaw = 0

    /** @type {boolean} */
    onGround = false

    /** @type {string} */
    platformChatId = ''

    // Device
    #deviceOS
    #deviceModel
    #deviceId

    /** @type {number[]} */
    chunks = []

    constructor(connection, address, logger, server) {
        super()
        this.#connection = connection
        this.#address = address
        this.#logger = logger
        this.#server = server
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
                    
                    this.sendAttributes(this.attributes.getDefaults())

                    this.#logger.info(`${this.name} is attempting to join with id ${this.runtimeId} from ${this.#address.address}:${this.#address.port}`)

                    this.setNameTag(this.name)
                    // TODO: always visible nametag
                    this.sendMetadata()

                    // First add
                    this.addToPlayerList()
                    // Then retrive other players
                    if (this.#server.players.size > 1) {
                        this.sendPlayerList() 
                    }
                }
               break
            case Identifiers.PacketViolationWarningPacket:
                console.log(packet)
                break   
            case Identifiers.RequestChunkRadiusPacket:
                pk = new ChunkRadiusUpdatedPacket()
                pk.radius = packet.radius
                this.sendDataPacket(pk)

                // Update player vieww distance
                this.viewDistance = pk.radius

                // Show chunks to the player
                pk = new NetworkChunkPublisherUpdatePacket()
                pk.x = this.x
                pk.y = this.y
                pk.z = this.z
                pk.radius = this.viewDistance * 16 
                this.sendDataPacket(pk)

                let worker = new Worker(__dirname + '/level/flat_generator_test.js')
                worker.postMessage(this.viewDistance)
                
                worker.on('message', function(chunk) {
                    this.sendCustomChunk(
                        chunk.chunkX,
                        chunk.chunkZ,
                        chunk.subCount,
                        chunk.data
                    )
                }.bind(this))

                this.sendPlayStatus(Status.PlayerSpawn)
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

                EventManager.emit('player_move', this)

                // Show chunks to the player
                // TODO: check this
                pk = new NetworkChunkPublisherUpdatePacket()
                pk.x = this.x
                pk.y = this.y
                pk.z = this.z
                pk.radius = this.viewDistance * 16 
                this.sendDataPacket(pk)

                // Broadcast movement to all online players
                for (const [_, player] of this.#server.players) {
                    if (player === this) continue
                    player.broadcastMove(this)
                    this.broadcastMove(player)
                }

                break   
            case Identifiers.LevelSoundEventPacket:
                // console.log(packet)
                break  
            case Identifiers.SetLocalPlayerAsInitializedPacket:
                EventManager.emit('player_join', this)

                for (const [_, player] of this.#server.players) {
                    if (player === this) continue
                    player.sendSpawn(this)
                    this.sendSpawn(player)
                }
                break    
            case Identifiers.TextPacket:
                let vanillaFormat = `<${packet.sourceName}> ${packet.message}`
                this.#logger.silly(vanillaFormat)

                // Broadcast chat message to every player
                if (packet.type == TextType.Chat) {
                    for (const [_, player] of this.#server.players) {
                        player.sendMessage(vanillaFormat, packet.xuid)
                    }
                }
                break            
        }
    }

    sendAttributes(attributes) {
        let pk = new UpdateAttributesPacket()
        pk.runtimeEntityId = this.runtimeId
        pk.attributes = attributes || this.attributes.getAttributes()
        this.sendDataPacket(pk)
    } 

    sendMetadata() {
        let pk = new SetActorDataPacket()
        pk.runtimeEntityId = this.runtimeId
        pk.metadata = this.metadata.getMetadata()
        this.sendDataPacket(pk)
    }

    /**
     * @param {string} message 
     * @param {boolean} needsTranslation
     */
    sendMessage(message, xuid = '', needsTranslation = false) {
        let pk = new TextPacket()
        pk.type = TextType.Raw
        pk.message = message
        pk.needsTranslation = needsTranslation
        pk.xuid = xuid 
        pk.platformChatId = ''  // TODO
        this.sendDataPacket(pk)
    }

    sendCustomChunk(chunkX, chunkZ, subCount, data) {
        let pk = new LevelChunkPacket()
        pk.chunkX = chunkX
        pk.chunkZ = chunkZ
        pk.subChunkCount = subCount
        pk.data = data
        this.sendDataPacket(pk)
    }

    /**
     * @param {Chunk} chunk 
     */
    sendChunk(chunk) {
        let pk = new LevelChunkPacket()
        pk.chunkX = chunk.getChunkX()
        pk.chunkZ = chunk.getChunkZ()
        pk.subChunkCount = chunk.getSubChunkSendCount()
        pk.data = chunk.toBinary()
        this.sendDataPacket(pk)
    }

    // Broadcast the movement to a defined player
    broadcastMove(player) {
        let pk = new MovePlayerPacket()
        pk.runtimeEntityId = this.runtimeId

        pk.positionX = this.x
        pk.positionY = this.y
        pk.positionZ = this.z

        pk.pitch = this.pitch
        pk.yaw = this.yaw
        pk.headYaw = this.headYaw

        pk.mode = MovementMode.Normal

        pk.onGround = this.onGround

        pk.ridingEntityRuntimeId = 0
        player.sendDataPacket(pk)
    }

    // Add the player to the client player list
    addToPlayerList() {
        let pk = new PlayerListPacket()
        pk.type = PlayerListAction.Add
        let entry = new PlayerListEntry()
        entry.uuid = UUID.fromString(this.uuid)
        entry.uniqueEntityId = this.runtimeId
        entry.name = this.name
        entry.xuid = this.xuid
        entry.platformChatId = ''  // TODO: read this value from StartGamePacket
        entry.buildPlatform = 0  // TODO: read also this
        entry.skin = this.skin
        entry.teacher = false  // TODO: figure out where to read teacher and host
        entry.host = false
        pk.entries.push(entry)
        for (const [_, player] of this.#server.players) {
            player.sendDataPacket(pk)
        }
    }

    // Removes a player from other players list
    removeFromPlayerList() {
        let pk = new PlayerListPacket()
        pk.type = PlayerListAction.Remove
        let entry = new PlayerListEntry()
        entry.uuid = UUID.fromString(this.uuid)
        pk.entries.push(entry)
        for (const [_, player] of this.#server.players) {
            player.sendDataPacket(pk)
        }
    }

    // Retrive all other player in server
    // And add them in the player list
    sendPlayerList() {
        let pk = new PlayerListPacket()
        pk.type = PlayerListAction.Add
        for (const [_, player] of this.#server.players) {
            if (player === this) continue
            let entry = new PlayerListEntry()
            entry.uuid = UUID.fromString(player.uuid)
            entry.uniqueEntityId = player.runtimeId
            entry.name = player.name
            entry.xuid = player.xuid
            entry.platformChatId = ''  // TODO: read this value from StartGamePacket
            entry.buildPlatform = 0  // TODO: read also this
            entry.skin = player.skin
            entry.teacher = false  // TODO: figure out where to read teacher and host
            entry.host = false
            pk.entries.push(entry)
        }
        this.sendDataPacket(pk)
    }

    // Spawn the player to another player
    sendSpawn(player) {
        let pk = new AddPlayerPacket()
        pk.uuid = UUID.fromString(this.uuid)
        pk.runtimeEntityId = this.runtimeId
        pk.name = this.name

        pk.positionX = this.x
        pk.positionY = this.y
        pk.positionZ = this.z

        // TODO: motion
        pk.motionX = 0
        pk.motionY = 0
        pk.motionZ = 0

        pk.pitch = this.pitch
        pk.yaw = this.yaw
        pk.headYaw = this.headYaw

        pk.deviceId = this.#deviceId
        pk.metadata = this.metadata.getMetadata()
        player.sendDataPacket(pk)
    }

    // Despawn the player entity from another player
    sendDespawn(player) {
        let pk = new RemoveActorPacket()
        pk.uniqueEntityId = this.runtimeId  // We use runtime as unique
        player.sendDataPacket(pk)
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