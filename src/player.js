const winston = require('winston')
const { Worker } = require('worker_threads')

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
const NetworkChunkPublisherUpdatePacket = require('./network/packet/network-chunk-publisher-update')
const DisconnectPacket = require('./network/packet/disconnect-packet')

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

    /** @type {Set<Number>} */
    loadedChunks = new Set()
    /** @type {Set<Number>} */
    loadingChunks = new Set()
    /** @type {Set<Chunk>} */
    chunkSendQueue = new Set()

    // for saving data on player (i can reference it where i want)
    otherData = {}

    generator = new Worker(__dirname + '/level/flat-generator.js')

    constructor(connection, address, logger, server) {
        super(server.defaultLevel)
        this.#connection = connection
        this.#address = address
        this.#logger = logger
        this.#server = server
        
        server.defaultLevel.addPlayer(this)

        this.generator.on('message', function(chunk) {
            this.chunkSendQueue.add(chunk)
        }.bind(this))
    }

    update(timestamp) {
        // Update movement for every player
        for (const [_, player] of this.#server.players) {
            if (player.runtimeId === this.runtimeId) continue
            player.broadcastMove(this)
            this.broadcastMove(player)
        }

        if (this.chunkSendQueue.size > 0) {
            this.chunkSendQueue.forEach(chunk => {
                if (!this.loadingChunks.has(chunk.hash)) {
                    this.chunkSendQueue.delete(chunk)
                }

                // Send the chunk 
                this.sendCustomChunk(
                    chunk.chunkX,
                    chunk.chunkZ,
                    chunk.subCount,
                    chunk.data,
                    chunk.hash
                )
                this.chunkSendQueue.delete(chunk)
            })
        }

        this.needNewChunks()  
    }

    // TODO: fix performance problems
    async needNewChunks(forceResend = false) {
        let currentXChunk = CoordinateUtils.fromBlockToChunk(this.x)
        let currentZChunk = CoordinateUtils.fromBlockToChunk(this.z)

        let viewDistance = this.viewDistance
        let chunksToSend = []

        for (let sendXChunk = -viewDistance; sendXChunk <= viewDistance; sendXChunk++) {
            for (let sendZChunk = -viewDistance; sendZChunk <= viewDistance; sendZChunk++) {
                let distance = Math.sqrt(sendZChunk * sendZChunk + sendXChunk * sendXChunk)
                let chunkDistance = Math.round(distance)

                if (chunkDistance <= viewDistance) {
                    let newChunk = [currentXChunk + sendXChunk, currentZChunk + sendZChunk]
                    let hash = CoordinateUtils.encodePos(newChunk[0], newChunk[1])

                    if (forceResend) {
                        chunksToSend.push(newChunk)
                    } else {
                        if (!this.loadedChunks.has(hash) && !this.loadingChunks.has(hash)) {
                            chunksToSend.push(newChunk)
                        }
                    }
                }
            }
        }

        // Send closer chunks before 
        chunksToSend.sort((c1, c2) => {
            if ((c1[0] === c2[0]) &&
                c1[1] === c2[2]) {
                return 0
            }

            let distXFirst = Math.abs(c1[0] - currentXChunk)
            let distXSecond = Math.abs(c2[0] - currentXChunk)

            let distZFirst = Math.abs(c1[1] - currentZChunk)
            let distZSecond = Math.abs(c2[1] - currentZChunk)

            if (distXFirst + distZFirst > distXSecond + distZSecond) {
                return 1
            } else if (distXFirst + distZFirst < distXSecond + distZSecond) {
                return -1
            }

            return 0
        })

        for (let chunk of chunksToSend) {
            let hash = CoordinateUtils.encodePos(chunk[0], chunk[1])
            if (forceResend) {
                if (!this.loadedChunks.has(hash) && !this.loadingChunks.has(hash)) {
                    this.loadingChunks.add(hash)
                    this.requestChunk(chunk[0], chunk[1])
                } else {
                    let loadedChunk = this.level.getChunk(chunk[0], chunk[1])
                    this.sendChunk(loadedChunk)
                }
            } else {
                this.loadingChunks.add(hash)
                this.requestChunk(chunk[0], chunk[1])
            }
        }

        let unloaded = false

        for (let hash of this.loadedChunks) {
            let [x, z] = CoordinateUtils.decodePos(hash)

            if (Math.abs(x - currentXChunk) > viewDistance ||
                Math.abs(z - currentZChunk) > viewDistance) {
                unloaded = true
                this.loadedChunks.delete(hash)
            }
        }

        for (let hash of this.loadingChunks) {
            let [x, z] = CoordinateUtils.decodePos(hash)

            if (Math.abs(x - currentXChunk) > viewDistance ||
                Math.abs(z - currentZChunk) > viewDistance) {
                this.loadingChunks.delete(hash)
            }
        }

        if (!unloaded || !(this.chunkSendQueue.size == 0)) {
            this.sendNetworkChunkPublisher()
        }
    }

    async requestChunk(x, z) {
        this.generator.postMessage({chunkX: x, chunkZ: z})
        // let loadedChunk = this.level.getChunk(x, z) <- invisible blocks :/ 
    }

    setGamemode(mode) {
        let pk = new SetGamemodePacket() 
        pk.gamemode = mode
        this.sendDataPacket(pk)
    }

    sendNetworkChunkPublisher() {
        let pk = new NetworkChunkPublisherUpdatePacket()
        pk.x = Math.floor(this.x)
        pk.y = Math.floor(this.y)
        pk.z = Math.floor(this.z)
        pk.radius = this.viewDistance << 4
        this.sendDataPacket(pk)
    }

    sendAvailableCommands() {
        let pk = new AvailableCommandsPacket()
        for (let command of this.#server.getCommandManager().commands) {
            pk.commandData.add({...command, execute: undefined})
        }
        this.sendDataPacket(pk)
    }

    // Updates the player view distance
    setViewDistance(distance) {
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

    sendCustomChunk(chunkX, chunkZ, subCount, data, hash) {
        let pk = new LevelChunkPacket()
        pk.chunkX = chunkX
        pk.chunkZ = chunkZ
        pk.subChunkCount = subCount
        pk.data = data
        this.sendDataPacket(pk)

        this.loadedChunks.add(hash)
        this.loadingChunks.delete(hash)
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

        let hash = CoordinateUtils.encodePos(
            chunk.getChunkX(), chunk.getChunkZ()
        )
        this.loadedChunks.add(hash)
        this.loadingChunks.delete(hash)
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

    /**
     * @param {string} reason 
     */
    kick(reason = 'unknown reason') {
        let pk = new DisconnectPacket()
        pk.hideDiscconnectionWindow = false
        pk.message = reason
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