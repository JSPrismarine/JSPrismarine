import type Prismarine from "../Prismarine";
import type Item from "../item";
import type Chunk from "../world/chunk/chunk";
import type World from "../world/World";
import Entity from "../entity/entity";
import Gamemode from "../world/Gamemode";

import EncapsulatedPacket from '@jsprismarine/raknet/protocol/encapsulated_packet';
import PlayStatusPacket from '../network/packet/play-status';
import BatchPacket from "../network/packet/batch";
import ChunkRadiusUpdatedPacket from '../network/packet/chunk-radius-updated';
import LevelChunkPacket from "../network/packet/level-chunk";
import UUID from '../utils/UUID';
import PlayerListPacket from '../network/packet/player-list';
import PlayerListAction from '../network/type/player-list-action';
import PlayerListEntry from '../network/type/PlayerListEntry';
import AddPlayerPacket from '../network/packet/add-player';
import MovePlayerPacket from '../network/packet/move-player';
import MovementType from '../network/type/movement-type';
import TextPacket from '../network/packet/text';
import TextType from '../network/type/text-type';
import RemoveActorPacket from '../network/packet/remove-actor';
import UpdateAttributesPacket from '../network/packet/update-attributes';
import SetActorDataPacket from '../network/packet/set-actor-data';
import CoordinateUtils from '../world/CoordinateUtils';
import AvailableCommandsPacket from '../network/packet/available-commands';
import SetGamemodePacket from '../network/packet/set-gamemode';
import CreativeContentPacket from '../network/packet/creative-content-packet';
import NetworkChunkPublisherUpdatePacket from '../network/packet/network-chunk-publisher-update';
import DisconnectPacket from '../network/packet/disconnect-packet';
import SetTimePacket from '../network/packet/set-time';
import PlayerInventory from '../inventory/player-inventory';
import InventoryContentPacket from '../network/packet/inventory-content-packet';
import MobEquipmentPacket from '../network/packet/mob-equipment-packet';
import CreativeContentEntry from '../network/type/CreativeContentEntry';

export enum PlayerPermission {
    Visitor,
    Member,
    Operator,
    Custom
};

export default class Player extends Entity {
    /** @type {Connection} */
    #connection: any
    /** @type {Prismarine} */
    #server: Prismarine
    /** @type {InetAddress} */
    #address: any

    /** @type {PlayerInventory} */
    inventory = new PlayerInventory()
    /** @type {Map<Number, Inventory>} */
    windows = new Map()

    /** @type {string} */
    name: string = ''
    /** @type {string} */
    locale: string = ''
    /** @type {number} */
    randomId: number = 0

    /** @type {string} */
    uuid: string | null = null
    /** @type {string} */
    xuid: string | null = null
    /** @type {Skin} */
    skin: any

    /** @type {number} */
    viewDistance: any
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
    device: any

    /** @type {boolean} */
    cacheSupport: boolean | null = null

    /** @type {Set<Number>} */
    loadedChunks = new Set()
    /** @type {Set<Number>} */
    loadingChunks = new Set()
    /** @type {Set<Chunk>} */
    chunkSendQueue = new Set()

    /** @type {null|Vector3} */
    breakingBlockPos = null  // temphack

    /** @type {null|Chunk} */
    currentChunk = null;

    /**
     * Player's constructor.
     * 
     * @param {Connection} connection - player's connection
     * @param {InetAddress} address - player's InternetAddress address
     * @param {World} world - a world to spawn the entity 
     * @param {Prismarine} server - the server instance
     */
    constructor(connection: any, address: any, world: World, server: Prismarine) {
        super(world);
        this.#connection = connection;
        this.#address = address;
        this.#server = server;

        // TODO: only set to default gamemode if there doesn't exist any save data for the user
        this.gamemode = Gamemode.getGamemodeId(server.getConfig().getGamemode());
    }

    public async update(tick: number) {
        // Update movement for every player
        for (const player of this.getServer().getOnlinePlayers()) {
            if (player === this) continue;
            player.broadcastMove(this);
            this.broadcastMove(player);
        }

        if (this.chunkSendQueue.size > 0) {
            this.chunkSendQueue.forEach((chunk: any) => {
                let encodedPos = CoordinateUtils.encodePos(
                    chunk.getX(), chunk.getZ()
                );
                if (!this.loadingChunks.has(encodedPos)) {
                    this.chunkSendQueue.delete(chunk);
                }

                this.sendChunk(chunk);
                this.chunkSendQueue.delete(chunk);
            });
        }

        await this.needNewChunks();
    }

    public async needNewChunks(forceResend = false) {
        let currentXChunk = CoordinateUtils.fromBlockToChunk(this.getX());
        let currentZChunk = CoordinateUtils.fromBlockToChunk(this.getZ());

        let viewDistance = this.viewDistance;
        let chunksToSend = [];

        for (let sendXChunk = -viewDistance; sendXChunk <= viewDistance; sendXChunk++) {
            for (let sendZChunk = -viewDistance; sendZChunk <= viewDistance; sendZChunk++) {
                let distance = Math.sqrt(sendZChunk * sendZChunk + sendXChunk * sendXChunk);
                let chunkDistance = Math.round(distance);

                if (chunkDistance <= viewDistance) {
                    let newChunk = [currentXChunk + sendXChunk, currentZChunk + sendZChunk];
                    let hash = CoordinateUtils.encodePos(newChunk[0], newChunk[1]);

                    if (forceResend) {
                        chunksToSend.push(newChunk);
                    } else {
                        if (!this.loadedChunks.has(hash) && !this.loadingChunks.has(hash)) {
                            chunksToSend.push(newChunk);
                        }
                    }
                }
            }
        }

        // Send closer chunks before 
        chunksToSend.sort((c1, c2) => {
            if ((c1[0] === c2[0]) &&
                c1[1] === c2[2]) {
                return 0;
            }

            let distXFirst = Math.abs(c1[0] - currentXChunk);
            let distXSecond = Math.abs(c2[0] - currentXChunk);

            let distZFirst = Math.abs(c1[1] - currentZChunk);
            let distZSecond = Math.abs(c2[1] - currentZChunk);

            if (distXFirst + distZFirst > distXSecond + distZSecond) {
                return 1;
            } else if (distXFirst + distZFirst < distXSecond + distZSecond) {
                return -1;
            }

            return 0;
        });

        await Promise.all(chunksToSend.map(async chunk => {
            let hash = CoordinateUtils.encodePos(chunk[0], chunk[1]);
            if (forceResend) {
                if (!this.loadedChunks.has(hash) && !this.loadingChunks.has(hash)) {
                    this.loadingChunks.add(hash);
                    await this.requestChunk(chunk[0], chunk[1]);
                } else {
                    let loadedChunk = await this.getWorld().getChunk(chunk[0], chunk[1]);
                    this.sendChunk(loadedChunk);
                }
            } else {
                this.loadingChunks.add(hash);
                await this.requestChunk(chunk[0], chunk[1]);
            }
        }));

        let unloaded = false;

        for (let hash of this.loadedChunks) {
            let [xx, zz] = CoordinateUtils.decodePos(hash as string);
            let x: number, z: number;
            x = parseFloat(xx);
            z = parseFloat(zz);

            if (Math.abs(x - currentXChunk) > viewDistance ||
                Math.abs(z - currentZChunk) > viewDistance) {
                unloaded = true;
                this.loadedChunks.delete(hash);
            }
        }

        for (let hash of this.loadingChunks) {
            let [xx, zz] = CoordinateUtils.decodePos(hash as string);
            let x: number, z: number;
            x = parseFloat(xx);
            z = parseFloat(zz);
            if (Math.abs(x - currentXChunk) > viewDistance ||
                Math.abs(z - currentZChunk) > viewDistance) {
                this.loadingChunks.delete(hash);
            }
        }

        if (!unloaded || !(this.chunkSendQueue.size == 0)) {
            this.sendNetworkChunkPublisher();
        }
    }

    public async requestChunk(x: number, z: number) {
        await this.getWorld().getChunk(x, z).then(
            (chunk: any) => {
                this.chunkSendQueue.add(chunk)
            }
        );
    }

    public sendInventory() {
        let pk;
        pk = new InventoryContentPacket();
        pk.items = this.inventory.getItems(true);
        pk.windowId = 0;  // Inventory window
        this.sendDataPacket(pk);

        pk = new InventoryContentPacket();
        pk.items = [];  // TODO
        pk.windowId = 78;  // ArmorInventory window
        this.sendDataPacket(pk);

        // https://github.com/NiclasOlofsson/MiNET/blob/master/src/MiNET/MiNET/Player.cs#L1736
        // TODO: documentate about
        // 0x7c (ui content)
        // 0x77 (off hand)

        this.sendHandItem(this.inventory.getItemInHand());  // TODO: not working
    }

    public sendCreativeContents() {
        let pk = new CreativeContentPacket();

        const entries = [
            ...this.getServer().getBlockManager().getBlocks(),
            ...this.getServer().getItemManager().getItems()
        ];

        // Sort based on numeric block ids and name
        pk.entries = entries.sort((a, b) => a.id - b.id || a.meta - b.meta)
            .filter(a => a.isPartOfCreativeInventory())
            .map((block: any, index: number) => new CreativeContentEntry(index, block));
        this.sendDataPacket(pk);
    }

    /**
     * Sets the item in the player hand.
     * 
     * @param {Item} item 
     */
    public sendHandItem(item: Item) {
        let pk = new MobEquipmentPacket();
        pk.runtimeEntityId = this.runtimeId;
        pk.item = item;
        pk.inventorySlot = this.inventory.getHandSlotIndex();
        pk.hotbarSlot = this.inventory.getHandSlotIndex();
        pk.windowId = 0;  // inventory ID
        this.sendDataPacket(pk);
    }

    public sendTime(time: number) {
        let pk = new SetTimePacket();
        pk.time = time;
        this.sendDataPacket(pk);
    }

    public setGamemode(mode: number) {
        this.gamemode = mode;
        
        let pk = new SetGamemodePacket();
        pk.gamemode = mode;
        this.sendDataPacket(pk);
    }

    public sendNetworkChunkPublisher() {
        let pk = new NetworkChunkPublisherUpdatePacket();
        pk.x = Math.floor(this.getX());
        pk.y = Math.floor(this.getY());
        pk.z = Math.floor(this.getZ());
        pk.radius = this.viewDistance << 4;
        this.sendDataPacket(pk);
    }

    public sendAvailableCommands() {
        let pk = new AvailableCommandsPacket();
        for (let command of this.getServer().getCommandManager().getCommands()) {
            if (!Array.isArray(command.parameters)) {
                pk.commandData.add({
                    ...command,
                    name: command.id.split(':')[1],
                    execute: undefined,
                    id: undefined
                });
            } else {
                for (let i = 0; i < command.parameters.length; i++) {
                    pk.commandData.add({
                        ...command,
                        name: command.id.split(':')[1],
                        parameters: command.parameters[i],
                        execute: undefined,
                        id: undefined
                    });
                }
            }
        }
        this.sendDataPacket(pk);
    }

    // Updates the player view distance
    public setViewDistance(distance: number) {
        this.viewDistance = distance;
        let pk = new ChunkRadiusUpdatedPacket();
        pk.radius = distance;
        this.sendDataPacket(pk);
    }

    public sendAttributes(attributes: any) {
        let pk = new UpdateAttributesPacket();
        pk.runtimeEntityId = this.runtimeId;
        pk.attributes = attributes || this.attributes.getAttributes();
        this.sendDataPacket(pk);
    }

    public sendMetadata() {
        let pk = new SetActorDataPacket();
        pk.runtimeEntityId = this.runtimeId;
        pk.metadata = this.metadata.getMetadata();
        this.sendDataPacket(pk);
    }

    /**
     * @param {string} message 
     * @param {boolean} needsTranslation
     */
    public sendMessage(message: string, xuid = '', needsTranslation = false) {
        let pk = new TextPacket();
        pk.type = TextType.Raw;
        pk.message = message;
        pk.needsTranslation = needsTranslation;
        pk.xuid = xuid;
        pk.platformChatId = '';  // TODO
        this.sendDataPacket(pk);
    }

    /**
     * @param {Chunk} chunk 
     */
    public sendChunk(chunk: Chunk) {
        let pk = new LevelChunkPacket();
        pk.chunkX = chunk.getX();
        pk.chunkZ = chunk.getZ();
        pk.subChunkCount = chunk.getSubChunkSendCount();
        pk.data = chunk.toBinary();
        this.sendDataPacket(pk);

        let hash = CoordinateUtils.encodePos(
            chunk.getX(), chunk.getZ()
        );
        this.loadedChunks.add(hash);
        this.loadingChunks.delete(hash);
    }

    /**
     * Broadcast the movement to a defined player
     * @param {Player} player 
     */
    public broadcastMove(player: Player) {
        let pk = new MovePlayerPacket();
        pk.runtimeEntityId = this.runtimeId;

        pk.positionX = this.getX();
        pk.positionY = this.getY();
        pk.positionZ = this.getZ();
        
        pk.pitch = this.pitch;
        pk.yaw = this.yaw;
        pk.headYaw = this.headYaw;

        pk.mode = MovementType.Normal;

        pk.onGround = this.onGround;

        pk.ridingEntityRuntimeId = 0;
        player.sendDataPacket(pk);
    }

    /**
     * Add the player to the client player list
     */
    public addToPlayerList() {
        let pk = new PlayerListPacket();
        pk.type = PlayerListAction.Add;
        let entry = new PlayerListEntry();
        entry.uuid = UUID.fromString(this.uuid as string);
        entry.uniqueEntityId = this.runtimeId;
        entry.name = this.name;
        entry.xuid = this.xuid as string;
        entry.platformChatId = '';  // TODO: read this value from StartGamePacket
        entry.buildPlatform = -1;  // TODO: read also this
        entry.skin = this.skin;
        entry.isTeacher = false;  // TODO: figure out where to read teacher and host
        entry.isHost = false;
        pk.entries.push(entry);
        for (let player of this.getServer().getOnlinePlayers()) {
            player.sendDataPacket(pk);
        }
    }

    /**
     * Removes a player from other players list
     */
    public removeFromPlayerList() {
        let pk = new PlayerListPacket();
        pk.type = PlayerListAction.Remove;
        let entry = new PlayerListEntry();
        entry.uuid = UUID.fromString(this.uuid as string);
        pk.entries.push(entry);
        for (let player of this.getServer().getOnlinePlayers()) {
            player.sendDataPacket(pk);
        }
    }

    /**
     * Retrieve all other player in server
     * and add them to the player's player list
     */
    public sendPlayerList() {
        let pk = new PlayerListPacket();
        pk.type = PlayerListAction.Add;
        for (let player of this.getServer().getOnlinePlayers()) {
            if (player === this) continue;
            let entry = new PlayerListEntry();
            entry.uuid = UUID.fromString(player.uuid as string);
            entry.uniqueEntityId = player.runtimeId;
            entry.name = player.name;
            entry.xuid = player.xuid as string;
            entry.platformChatId = '';  // TODO: read this value from StartGamePacket
            entry.buildPlatform = 0;  // TODO: read also this
            entry.skin = player.skin;
            entry.isTeacher = false;  // TODO: figure out where to read teacher and host
            entry.isHost = false;
            pk.entries.push(entry);
        }
        this.sendDataPacket(pk);
    }

    /**
     * Spawn the player to another player
     * @param {Player} player 
     */
    public sendSpawn(player: Player) {
        let pk = new AddPlayerPacket();
        pk.uuid = UUID.fromString(this.uuid as string);
        pk.runtimeEntityId = this.runtimeId;
        pk.name = this.name;

        pk.positionX = this.getX();
        pk.positionY = this.getY();
        pk.positionZ = this.getZ();

        // TODO: motion
        pk.motionX = 0;
        pk.motionY = 0;
        pk.motionZ = 0;

        pk.pitch = this.pitch;
        pk.yaw = this.yaw;
        pk.headYaw = this.headYaw;

        pk.deviceId = this.device.id;
        pk.metadata = this.metadata.getMetadata();
        player.sendDataPacket(pk);
    }

    /**
     * Despawn the player entity from another player
     * @param {Player} player 
     */
    public sendDespawn(player: Player) {
        let pk = new RemoveActorPacket();
        pk.uniqueEntityId = this.runtimeId;  // We use runtime as unique
        player.sendDataPacket(pk);
    }

    /**
     * @param {number} status 
     */
    public sendPlayStatus(status: number) {
        let pk = new PlayStatusPacket();
        pk.status = status;
        this.sendDataPacket(pk);
    }

    /**
     * @param {string} reason 
     */
    public kick(reason = 'unknown reason') {
        let pk = new DisconnectPacket();
        pk.hideDiscconnectionWindow = false;
        pk.message = reason;
        this.sendDataPacket(pk);
    }

    // To refactor
    public sendDataPacket(packet: any, _needACK = false, _immediate = false) {
        let batch = new BatchPacket();
        batch.addPacket(packet);
        batch.encode();

        // Add this in raknet
        let sendPacket = new EncapsulatedPacket();
        sendPacket.reliability = 0;
        sendPacket.buffer = batch.buffer;

        this.#connection.addEncapsulatedToQueue(sendPacket);
    }

    // Return all the players in the same chunk
    public getPlayersInChunk() {
        return this.#server.getOnlinePlayers()
            .filter(player => player.currentChunk === this.currentChunk);
    }

    public getServer() {
        return this.#server;
    }

    public getAddress() {
        return this.#address;
    }
}
