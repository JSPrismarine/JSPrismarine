const winston = require('winston')

const Connection = require('jsraknet/connection')
const Entity = require('./entity/entity')
const EncapsulatedPacket = require('jsraknet/protocol/encapsulated_packet')
const InetAddress = require('jsraknet/utils/inet_address')
const PlayStatusPacket= require('./network/packet/play-status')
const BatchPacket = require("./network/packet/batch")
const ChunkRadiusUpdatedPacket = require('./network/packet/chunk-radius-updated')
const Chunk = require('./level/chunk/chunk')
const LevelChunkPacket = require("./network/packet/level-chunk")
const Skin = require('./utils/skin')
const UUID = require('./utils/uuid')
const Prismarine = require('./prismarine')
const PlayerListPacket = require('./network/packet/player-list')
const PlayerListAction = require('./network/type/player-list-action')
const PlayerListEntry = require('./network/type/player-list-entry') 
const AddPlayerPacket = require('./network/packet/add-player')
const MovePlayerPacket = require('./network/packet/move-player')
const MovementType = require('./network/type/movement-type')
const TextPacket = require('./network/packet/text')
const TextType = require('./network/type/text-type')
const RemoveActorPacket = require('./network/packet/remove-actor')
const UpdateAttributesPacket = require('./network/packet/update-attributes')
const SetActorDataPacket = require('./network/packet/set-actor-data')
const CoordinateUtils = require('./level/coordinate-utils')
const AvailableCommandsPacket = require('./network/packet/available-commands')
const SetGamemodePacket = require('./network/packet/set-gamemode')

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
    deviceOS
    deviceModel
    deviceId

    cacheSupport

    /** @type {number[]} */
    chunks = []

    constructor(connection, address, logger, server) {
        super(server.defaultLevel)
        this.#connection = connection
        this.#address = address
        this.#logger = logger
        this.#server = server
        
        server.defaultLevel.addPlayer(this)
    }

    setGamemode(mode) {
        let pk = new SetGamemodePacket() 
        pk.gamemode = mode
        this.sendDataPacket(pk)
    }

    sendAvailableCommands() {
        let pk = new AvailableCommandsPacket()

        for (let command of this.#server.getCommandManager().commands) {
            pk.commandData.add(command.data)
        }
        this.sendDataPacket(pk)
    }

    // Updates the player view distance
    sendViewDistance(distance) {
        this.viewDistance = distance
        let pk = new ChunkRadiusUpdatedPacket()
        pk.radius = distance
        this.sendDataPacket(pk)
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

        let index = CoordinateUtils.chunkId(chunkX, chunkZ)
        this.chunks.push(index)
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

        let index = CoordinateUtils.chunkId(
            chunk.getChunkX(), chunk.getChunkZ()
        )
        this.chunks.push(index)
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

        pk.mode = MovementType.Normal

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

        pk.deviceId = this.deviceId
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

    getServer() {
        return this.#server
    }

    getAddress() {
        return this.#address
    }

}
module.exports = Player