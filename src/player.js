const Connection = require('@jsprismarine/raknet/connection')
const Entity = require('./entity/entity')
const EncapsulatedPacket = require('@jsprismarine/raknet/protocol/encapsulated_packet')
const InetAddress = require('@jsprismarine/raknet/utils/inet_address')
const PlayStatusPacket = require('./network/packet/play-status')
const BatchPacket = require("./network/packet/batch")
const ChunkRadiusUpdatedPacket = require('./network/packet/chunk-radius-updated')
const Chunk = require('./world/chunk/chunk')
const LevelChunkPacket = require("./network/packet/level-chunk")
const Skin = require('./utils/skin/skin')
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
const CoordinateUtils = require('./world/coordinate-utils')
const AvailableCommandsPacket = require('./network/packet/available-commands')
const SetGamemodePacket = require('./network/packet/set-gamemode')
const CreativeContentPacket = require('./network/packet/creative-content-packet')
const NetworkChunkPublisherUpdatePacket = require('./network/packet/network-chunk-publisher-update')
const DisconnectPacket = require('./network/packet/disconnect-packet')
const Device = require('./utils/device')
const World = require('./world/world')
const SetTimePacket = require('./network/packet/set-time')
const PlayerInventory = require('./inventory/player-inventory')
const Inventory = require('./inventory/inventory')
const InventoryContentPacket = require('./network/packet/inventory-content-packet')
const MobEquipmentPacket = require('./network/packet/mob-equipment-packet')
const Item = require('./inventory/item/item')
const CreativeContentEntry = require('./network/type/creative-content-entry')

'use strict'

class Player extends Entity {

    /** @type {Connection} */
    #connection
    /** @type {Prismarine} */
    #server
    /** @type {InetAddress} */
    #address

    /** @type {PlayerInventory} */
    inventory = new PlayerInventory()
    /** @type {Map<Number, Inventory>} */
    windows = new Map()

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

    /** @type {Device} */
    device

    /** @type {boolean} */
    cacheSupport

    /** @type {Set<Number>} */
    loadedChunks = new Set()
    /** @type {Set<Number>} */
    loadingChunks = new Set()
    /** @type {Set<Chunk>} */
    chunkSendQueue = new Set()

    /**
     * Player's constructor.
     * 
     * @param {Connection} connection - player's connection
     * @param {InetAddress} address - player's InternetAddress address
     * @param {World} world - a world to spawn the entity 
     * @param {Prismarine} server - the server instance
     */
    constructor(connection, address, world, server) {
        super(world)
        this.#connection = connection
        this.#address = address
        this.#server = server

        // TODO: only set to default gamemode if there doesn't exist any save data for the user
        this.gamemode = server.getConfig().get(`gamemode`, 0)
    }

    update(_timestamp) {
        // Update movement for every player
        for (const player of this.getServer().getOnlinePlayers()) {
            if (player === this) continue
            player.broadcastMove(this)
            this.broadcastMove(player)
        }

        if (this.chunkSendQueue.size > 0) {
            this.chunkSendQueue.forEach(chunk => {
                let encodedPos = CoordinateUtils.encodePos(
                    chunk.getX(), chunk.getZ()
                )
                if (!this.loadingChunks.has(encodedPos)) {
                    this.chunkSendQueue.delete(chunk)
                }

                this.sendChunk(chunk)
                this.chunkSendQueue.delete(chunk)
            })
        }

        this.needNewChunks()
    }

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

        await Promise.all(chunksToSend.map(async chunk => {
            let hash = CoordinateUtils.encodePos(chunk[0], chunk[1])
            if (forceResend) {
                if (!this.loadedChunks.has(hash) && !this.loadingChunks.has(hash)) {
                    this.loadingChunks.add(hash)
                    await this.requestChunk(chunk[0], chunk[1])
                } else {
                    let loadedChunk = this.level.getChunk(chunk[0], chunk[1])
                    this.sendChunk(loadedChunk)
                }
            } else {
                this.loadingChunks.add(hash)
                await this.requestChunk(chunk[0], chunk[1])
            }
        }))

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
        await this.getWorld().getChunk(x, z).then(
            chunk => this.chunkSendQueue.add(chunk)
        )
    }

    sendInventory() {
        let pk = new InventoryContentPacket()
        pk.items = this.inventory.getItems(true)
        pk.windowId = 0  // Inventory window
        this.sendDataPacket(pk)
    }

    sendCreativeContents() {
        let pk = new CreativeContentPacket()
        // TODO: implement full block list
        pk.entries = [
            new CreativeContentEntry(1, new Item(5, 0, 1, null, 'Test'))
        ]
        this.sendDataPacket(pk)
    }

    /**
     * Sets the item in the player hand.
     * 
     * @param {Item} item 
     */
    sendHandItem(item) {
        let pk = new MobEquipmentPacket()
        pk.runtimeEntityId = this.runtimeId
        pk.item = item
        pk.inventorySlot = this.inventory.getHandSlotIndex()
        pk.hotbarSlot = this.inventory.getHandSlotIndex()
        pk.windowId = 0  // inventory ID
        this.sendDataPacket(pk)
    }

    sendTime(time) {
        let pk = new SetTimePacket()
        pk.time = time
        this.sendDataPacket(pk)
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
        for (let command of this.getServer().getCommandManager().commands) {
            pk.commandData.add({ ...command, execute: undefined })
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

    /**
     * @param {Chunk} chunk 
     */
    sendChunk(chunk) {
        let pk = new LevelChunkPacket()
        pk.chunkX = chunk.getX()
        pk.chunkZ = chunk.getZ()
        pk.subChunkCount = chunk.getSubChunkSendCount()
        pk.data = chunk.toBinary()
        this.sendDataPacket(pk)

        let hash = CoordinateUtils.encodePos(
            chunk.getX(), chunk.getZ()
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
        entry.buildPlatform = -1  // TODO: read also this
        entry.skin = this.skin
        entry.isTeacher = false  // TODO: figure out where to read teacher and host
        entry.isHost = false
        pk.entries.push(entry)
        for (let player of this.getServer().getOnlinePlayers()) {
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
        for (let player of this.getServer().getOnlinePlayers()) {
            player.sendDataPacket(pk)
        }
    }

    // Retrive all other player in server
    // And add them in the player list
    sendPlayerList() {
        let pk = new PlayerListPacket()
        pk.type = PlayerListAction.Add
        for (let player of this.getServer().getOnlinePlayers()) {
            if (player === this) continue
            let entry = new PlayerListEntry()
            entry.uuid = UUID.fromString(player.uuid)
            entry.uniqueEntityId = player.runtimeId
            entry.name = player.name
            entry.xuid = player.xuid
            entry.platformChatId = ''  // TODO: read this value from StartGamePacket
            entry.buildPlatform = 0  // TODO: read also this
            entry.skin = player.skin
            entry.isTeacher = false  // TODO: figure out where to read teacher and host
            entry.isHost = false
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

        pk.deviceId = this.device.id
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
