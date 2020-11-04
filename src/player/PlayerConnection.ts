import type Prismarine from "../Prismarine";
import TextType from "../network/type/TextType";
import TextPacket from "../network/packet/TextPacket";
import MovementType from "../network/type/MovementType";
import Block from "../block/Block";
import DisconnectPacket from "../network/packet/DisconnectPacket";
import Item from "../item/Item";
import Chunk from "../world/chunk/Chunk";
import type Connection from "../network/raknet/connection";
import type Player from "./Player";

const EncapsulatedPacket = require('../network/raknet/protocol/encapsulated_packet');
const PlayStatusPacket = require('../network/packet/play-status');
const BatchPacket = require("../network/packet/batch");
const ChunkRadiusUpdatedPacket = require('../network/packet/chunk-radius-updated');
const LevelChunkPacket = require("../network/packet/level-chunk");
const UUID = require('../utils/uuid');
const PlayerListPacket = require('../network/packet/player-list');
const PlayerListAction = require('../network/type/player-list-action');
const PlayerListEntry = require('../network/type/player-list-entry');
const AddPlayerPacket = require('../network/packet/add-player');
const MovePlayerPacket = require('../network/packet/move-player');
const RemoveActorPacket = require('../network/packet/remove-actor');
const UpdateAttributesPacket = require('../network/packet/update-attributes');
const SetActorDataPacket = require('../network/packet/set-actor-data');
const CoordinateUtils = require('../world/coordinate-utils');
const AvailableCommandsPacket = require('../network/packet/available-commands');
const SetGamemodePacket = require('../network/packet/set-gamemode');
const CreativeContentPacket = require('../network/packet/creative-content-packet');
const NetworkChunkPublisherUpdatePacket = require('../network/packet/network-chunk-publisher-update');
const SetTimePacket = require('../network/packet/set-time');
const InventoryContentPacket = require('../network/packet/inventory-content-packet');
const MobEquipmentPacket = require('../network/packet/mob-equipment-packet');
const CreativeContentEntry = require('../network/type/creative-content-entry');
const { creativeitems } = require("@jsprismarine/bedrock-data");

export default class PlayerConnection {
    private player: Player;
    private connection: Connection;
    private server: Prismarine;
    private chunkSendQueue: Set<Chunk> = new Set();
    loadedChunks: Set<number> = new Set();
    loadingChunks: Set<number> = new Set();

    constructor(server: Prismarine, connection: Connection, player: Player) {
        this.server = server;
        this.connection = connection;
        this.player = player;
    }

    // To refactor
    async sendDataPacket(packet: any, _needACK = false, _immediate = false) {
        let batch = new BatchPacket();
        batch.addPacket(packet);
        batch.encode();

        // Add this in raknet
        let sendPacket = new EncapsulatedPacket();
        sendPacket.reliability = 0;
        sendPacket.buffer = batch.buffer;

        this.connection.addEncapsulatedToQueue(sendPacket);
    }

    public async update(tick: number) {
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
        let currentXChunk = CoordinateUtils.fromBlockToChunk(this.player.getX());
        let currentZChunk = CoordinateUtils.fromBlockToChunk(this.player.getZ());

        let viewDistance = this.player.viewDistance;
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
                    let loadedChunk = await this.player.getWorld().getChunk(chunk[0], chunk[1]);
                    this.sendChunk(loadedChunk);
                }
            } else {
                this.loadingChunks.add(hash);
                await this.requestChunk(chunk[0], chunk[1]);
            }
        }));

        let unloaded = false;

        for (let hash of this.loadedChunks) {
            let [x, z] = CoordinateUtils.decodePos(hash);

            if (Math.abs(x - currentXChunk) > viewDistance ||
                Math.abs(z - currentZChunk) > viewDistance) {
                unloaded = true;
                this.loadedChunks.delete(hash);
            }
        }

        for (let hash of this.loadingChunks) {
            let [x, z] = CoordinateUtils.decodePos(hash);

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
        await this.player.getWorld().getChunk(x, z).then(
            (chunk: any) => {
                this.chunkSendQueue.add(chunk)
            }
        );
    }

    public sendInventory() {
        let pk;
        pk = new InventoryContentPacket();
        pk.items = this.player.inventory.getItems(true);
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

        this.sendHandItem(this.player.inventory.getItemInHand());  // TODO: not working
    }

    public sendCreativeContents() {
        let pk = new CreativeContentPacket();

        const entries = [
            ...this.player.getServer().getBlockManager().getBlocks(),
            ...this.player.getServer().getItemManager().getItems()
        ];

        // Sort based on PmmP Bedrock-data
        creativeitems.forEach((item: any) => {
            pk.entries.push(
                ...entries.filter((entry: any) => {
                    return entry.meta === (item.damage || 0) && entry.id === item.id
                })
            );
        });

        pk.entries = pk.entries.map((block: Block | Item, index: number) => {
            return new CreativeContentEntry(index, block);
        })

        this.sendDataPacket(pk);
    }

    /**
     * Sets the item in the player hand.
     * 
     * @param {Item} item 
     */
    public sendHandItem(item: Item) {
        let pk = new MobEquipmentPacket();
        pk.runtimeEntityId = this.player.runtimeId;
        pk.item = item;
        pk.inventorySlot = this.player.inventory.getHandSlotIndex();
        pk.hotbarSlot = this.player.inventory.getHandSlotIndex();
        pk.windowId = 0;  // inventory ID
        this.sendDataPacket(pk);
    }

    public sendTime(time: number) {
        let pk = new SetTimePacket();
        pk.time = time;
        this.sendDataPacket(pk);
    }

    public setGamemode(mode: number) {
        this.player.gamemode = mode;

        let pk = new SetGamemodePacket();
        pk.gamemode = mode;
        this.sendDataPacket(pk);
    }

    public sendNetworkChunkPublisher() {
        let pk = new NetworkChunkPublisherUpdatePacket();
        pk.x = Math.floor(this.player.getX() as number);
        pk.y = Math.floor(this.player.getY() as number);
        pk.z = Math.floor(this.player.getZ() as number);
        pk.radius = this.player.viewDistance << 4;
        this.sendDataPacket(pk);
    }

    public sendAvailableCommands() {
        let pk = new AvailableCommandsPacket();
        for (let command of this.server.getCommandManager().getCommands()) {
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
        this.player.viewDistance = distance;
        let pk = new ChunkRadiusUpdatedPacket();
        pk.radius = distance;
        this.sendDataPacket(pk);
    }

    public sendAttributes(attributes: any) {
        let pk = new UpdateAttributesPacket();
        pk.runtimeEntityId = this.player.runtimeId;
        pk.attributes = attributes || this.player.attributes.getAttributes();
        this.sendDataPacket(pk);
    }

    public sendMetadata() {
        let pk = new SetActorDataPacket();
        pk.runtimeEntityId = this.player.runtimeId;
        pk.metadata = this.player.metadata.getMetadata();
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
    public broadcastMove(player: Player, mode = MovementType.Normal) {
        let pk = new MovePlayerPacket();
        pk.runtimeEntityId = this.player.runtimeId;

        pk.positionX = this.player.getX();
        pk.positionY = this.player.getY();
        pk.positionZ = this.player.getZ();

        pk.pitch = this.player.pitch;
        pk.yaw = this.player.yaw;
        pk.headYaw = this.player.headYaw;

        pk.mode = mode;

        pk.onGround = this.player.onGround;

        pk.ridingEntityRuntimeId = 0;
        this.sendDataPacket(pk);
    }

    /**
     * Add the player to the client player list
     */
    public addToPlayerList() {
        let pk = new PlayerListPacket();
        pk.type = PlayerListAction.Add;
        let entry = new PlayerListEntry();
        entry.uuid = UUID.fromString(this.player.uuid);
        entry.uniqueEntityId = this.player.runtimeId;
        entry.name = this.player.getUsername();
        entry.xuid = this.player.xuid;
        entry.platformChatId = '';  // TODO: read this value from StartGamePacket
        entry.buildPlatform = -1;  // TODO: read also this
        entry.skin = this.player.skin;
        entry.isTeacher = false;  // TODO: figure out where to read teacher and host
        entry.isHost = false;
        pk.entries.push(entry);
        for (let player of this.server.getOnlinePlayers()) {
            player.getPlayerConnection().sendDataPacket(pk);
        }
    }

    /**
     * Removes a player from other players list
     */
    public removeFromPlayerList() {
        let pk = new PlayerListPacket();
        pk.type = PlayerListAction.Remove;
        let entry = new PlayerListEntry();
        entry.uuid = UUID.fromString(this.player.uuid);
        pk.entries.push(entry);
        for (let player of this.server.getOnlinePlayers()) {
            player.getPlayerConnection().sendDataPacket(pk);
        }
    }

    /**
     * Retrieve all other player in server
     * and add them to the player's player list
     */
    public sendPlayerList() {
        let pk = new PlayerListPacket();
        pk.type = PlayerListAction.Add;
        for (let player of this.server.getOnlinePlayers()) {
            if (player === this.player)
                continue;

            let entry = new PlayerListEntry();
            entry.uuid = UUID.fromString(player.uuid);
            entry.uniqueEntityId = player.runtimeId;
            entry.name = player.getUsername();
            entry.xuid = player.xuid;
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
     */
    public sendSpawn(player: Player) {
        let pk = new AddPlayerPacket();
        pk.uuid = UUID.fromString(this.player.uuid);
        pk.runtimeEntityId = this.player.runtimeId;
        pk.name = this.player.getUsername();

        pk.positionX = this.player.getX();
        pk.positionY = this.player.getY();
        pk.positionZ = this.player.getZ();

        // TODO: motion
        pk.motionX = 0;
        pk.motionY = 0;
        pk.motionZ = 0;

        pk.pitch = this.player.pitch;
        pk.yaw = this.player.yaw;
        pk.headYaw = this.player.headYaw;

        pk.deviceId = this.player.device.id;
        pk.metadata = this.player.metadata.getMetadata();
        player.getPlayerConnection().sendDataPacket(pk);
    }

    /**
     * Despawn the player entity from another player
     * @param {Player} player 
     */
    public sendDespawn(player: Player) {
        let pk = new RemoveActorPacket();
        pk.uniqueEntityId = this.player.runtimeId;  // We use runtime as unique
        player.getPlayerConnection().sendDataPacket(pk);
    }

    /**
     * @param {number} status 
     */
    public sendPlayStatus(status: number) {
        let pk = new PlayStatusPacket();
        pk.status = status;
        this.sendDataPacket(pk);
    }

    public kick(reason = 'unknown reason') {
        let pk = new DisconnectPacket();
        pk.hideDisconnectionWindow = false;
        pk.message = reason;
        this.sendDataPacket(pk, false, true);
    }
};
