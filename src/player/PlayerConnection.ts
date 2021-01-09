import AdventureSettingsPacket, {
    AdventureSettingsFlags
} from '../network/packet/AdventureSettingsPacket';
import {
    CommandArgumentEntity,
    CommandArgumentFloatPosition,
    CommandArgumentGamemode
} from '../command/CommandArguments';
import CommandParameter, {
    CommandParameterType
} from '../network/type/CommandParameter';
import PlayerListPacket, {
    PlayerListAction,
    PlayerListEntry
} from '../network/packet/PlayerListPacket';

import AddPlayerPacket from '../network/packet/AddPlayerPacket';
import { Attribute } from '../entity/attribute';
import AvailableCommandsPacket from '../network/packet/AvailableCommandsPacket';
import BatchPacket from '../network/packet/BatchPacket';
import Block from '../block/Block';
import Chunk from '../world/chunk/Chunk';
import ChunkRadiusUpdatedPacket from '../network/packet/ChunkRadiusUpdatedPacket';
import type Connection from '../network/raknet/Connection';
import ContainerEntry from '../inventory/ContainerEntry';
import CoordinateUtils from '../world/CoordinateUtils';
import CreativeContentEntry from '../network/type/CreativeContentEntry';
import CreativeContentPacket from '../network/packet/CreativeContentPacket';
import DataPacket from '../network/packet/DataPacket';
import DisconnectPacket from '../network/packet/DisconnectPacket';
import EncapsulatedPacket from '../network/raknet/protocol/EncapsulatedPacket';
import IntegerArgumentType from '@jsprismarine/brigadier/dist/lib/arguments/IntegerArgumentType';
import InventoryContentPacket from '../network/packet/InventoryContentPacket';
import Item from '../item/Item';
import LevelChunkPacket from '../network/packet/LevelChunkPacket';
import MobEquipmentPacket from '../network/packet/MobEquipmentPacket';
import MovePlayerPacket from '../network/packet/MovePlayerPacket';
import MovementType from '../network/type/MovementType';
import NetworkChunkPublisherUpdatePacket from '../network/packet/NetworkChunkPublisherUpdatePacket';
import PermissionType from '../network/type/PermissionType';
import PlayStatusPacket from '../network/packet/PlayStatusPacket';
import type Player from './Player';
import PlayerPermissionType from '../network/type/PlayerPermissionType';
import RemoveActorPacket from '../network/packet/RemoveActorPacket';
import type Server from '../Server';
import SetActorDataPacket from '../network/packet/SetActorDataPacket';
import SetGamemodePacket from '../network/packet/SetGamemodePacket';
import SetTimePacket from '../network/packet/SetTimePacket';
import Skin from '../utils/skin/Skin';
import StringArgumentType from '@jsprismarine/brigadier/dist/lib/arguments/StringArgumentType';
import TextPacket from '../network/packet/TextPacket';
import TextType from '../network/type/TextType';
import UUID from '../utils/UUID';
import UpdateAttributesPacket from '../network/packet/UpdateAttributesPacket';
import { WindowIds } from '../inventory/WindowManager';

const { creativeitems } = require('@jsprismarine/bedrock-data');

export default class PlayerConnection {
    private player: Player;
    private readonly connection: Connection;
    private readonly server: Server;
    private readonly chunkSendQueue: Set<Chunk> = new Set();
    private readonly loadedChunks: Set<string> = new Set();
    private readonly loadingChunks: Set<string> = new Set();

    constructor(server: Server, connection: Connection, player: Player) {
        this.server = server;
        this.connection = connection;
        this.player = player;
    }

    // To refactor
    public async sendDataPacket(packet: DataPacket): Promise<void> {
        const batch = new BatchPacket();
        batch.addPacket(packet);
        batch.encode();

        // Add this in raknet
        const sendPacket = new EncapsulatedPacket();
        sendPacket.reliability = 0;
        sendPacket.buffer = batch.getBuffer();

        await this.connection.addEncapsulatedToQueue(sendPacket);
    }

    public async update(_tick: number) {
        if (this.chunkSendQueue.size > 0) {
            for (const chunk of this.chunkSendQueue) {
                const encodedPos = CoordinateUtils.encodePos(
                    chunk.getX(),
                    chunk.getZ()
                );
                if (!this.loadingChunks.has(encodedPos)) {
                    this.chunkSendQueue.delete(chunk);
                }

                await this.sendChunk(chunk);
                this.chunkSendQueue.delete(chunk);
            }
        }

        await this.needNewChunks();
    }

    public async sendSettings(player?: Player) {
        const target = player || this.player;
        const pk = new AdventureSettingsPacket();

        pk.setFlag(
            AdventureSettingsFlags.WorldImmutable,
            target.gamemode === 3
        );
        pk.setFlag(AdventureSettingsFlags.NoPvp, target.gamemode === 3);
        pk.setFlag(AdventureSettingsFlags.AutoJump, true); // TODO
        pk.setFlag(AdventureSettingsFlags.AllowFlight, target.getAllowFlight());
        pk.setFlag(AdventureSettingsFlags.NoClip, target.gamemode === 3);
        pk.setFlag(AdventureSettingsFlags.Flying, target.isFlying());

        pk.commandPermission = target.isOp()
            ? PermissionType.Operator
            : PermissionType.Normal;
        pk.playerPermission = target.isOp()
            ? PlayerPermissionType.Operator
            : PlayerPermissionType.Member;
        pk.entityId = target.runtimeId;
        await this.sendDataPacket(pk);
    }

    public async needNewChunks(forceResend = false) {
        const currentXChunk = CoordinateUtils.fromBlockToChunk(
            this.player.getX()
        );
        const currentZChunk = CoordinateUtils.fromBlockToChunk(
            this.player.getZ()
        );

        const viewDistance = this.player.viewDistance;
        const chunksToSend: number[][] = [];

        for (
            let sendXChunk = -viewDistance;
            sendXChunk <= viewDistance;
            sendXChunk++
        ) {
            for (
                let sendZChunk = -viewDistance;
                sendZChunk <= viewDistance;
                sendZChunk++
            ) {
                const distance = Math.sqrt(
                    sendZChunk * sendZChunk + sendXChunk * sendXChunk
                );
                const chunkDistance = Math.round(distance);

                if (chunkDistance <= viewDistance) {
                    const newChunk = [
                        currentXChunk + sendXChunk,
                        currentZChunk + sendZChunk
                    ];
                    const hash = CoordinateUtils.encodePos(
                        newChunk[0],
                        newChunk[1]
                    );

                    if (forceResend) {
                        chunksToSend.push(newChunk);
                    } else if (
                        !this.loadedChunks.has(hash) &&
                        !this.loadingChunks.has(hash)
                    ) {
                        chunksToSend.push(newChunk);
                    }
                }
            }
        }

        // Send closer chunks before
        chunksToSend.sort((c1, c2) => {
            if (c1[0] === c2[0] && c1[1] === c2[2]) {
                return 0;
            }

            const distXFirst = Math.abs(c1[0] - currentXChunk);
            const distXSecond = Math.abs(c2[0] - currentXChunk);

            const distZFirst = Math.abs(c1[1] - currentZChunk);
            const distZSecond = Math.abs(c2[1] - currentZChunk);

            if (distXFirst + distZFirst > distXSecond + distZSecond) {
                return 1;
            }

            if (distXFirst + distZFirst < distXSecond + distZSecond) {
                return -1;
            }

            return 0;
        });

        for (const chunk of chunksToSend) {
            const hash = CoordinateUtils.encodePos(chunk[0], chunk[1]);
            if (forceResend) {
                if (
                    !this.loadedChunks.has(hash) &&
                    !this.loadingChunks.has(hash)
                ) {
                    this.loadingChunks.add(hash);
                    await this.requestChunk(chunk[0], chunk[1]);
                } else {
                    const loadedChunk = await this.player
                        .getWorld()
                        .getChunk(chunk[0], chunk[1]);
                    await this.sendChunk(loadedChunk);
                }
            } else {
                this.loadingChunks.add(hash);
                await this.requestChunk(chunk[0], chunk[1]);
            }
        }

        let unloaded = false;

        for (const hash of this.loadedChunks) {
            const [x, z] = CoordinateUtils.decodePos(hash);

            if (
                Math.abs(x - currentXChunk) > viewDistance ||
                Math.abs(z - currentZChunk) > viewDistance
            ) {
                unloaded = true;
                this.loadedChunks.delete(hash);
            }
        }

        for (const hash of this.loadingChunks) {
            const [x, z] = CoordinateUtils.decodePos(hash);

            if (
                Math.abs(x - currentXChunk) > viewDistance ||
                Math.abs(z - currentZChunk) > viewDistance
            ) {
                this.loadingChunks.delete(hash);
            }
        }

        if (unloaded ?? !(this.chunkSendQueue.size === 0)) {
            await this.sendNetworkChunkPublisher();
        }
    }

    public async requestChunk(x: number, z: number) {
        const chunk = await this.player.getWorld().getChunk(x, z);
        this.chunkSendQueue.add(chunk);
    }

    public async sendInventory() {
        const pk = new InventoryContentPacket();
        pk.items = this.player.getInventory().getItems(true);
        pk.windowId = WindowIds.INVENTORY; // Inventory window
        await this.sendDataPacket(pk);
        await this.sendHandItem(this.player.getInventory().getItemInHand());

        /* TODO: not working..
        pk = new InventoryContentPacket();
        pk.items = []; // TODO
        pk.windowId = 78; // ArmorInventory window
        this.sendDataPacket(pk);

        https://github.com/NiclasOlofsson/MiNET/blob/master/src/MiNET/MiNET/Player.cs#L1736
        // TODO: documentate about
        0x7c (ui content)
        0x77 (off hand)
        */
    }

    public async sendCreativeContents(empty = false) {
        const pk = new CreativeContentPacket();
        if (empty) {
            await this.sendDataPacket(pk);
            return;
        }

        const entries = [
            ...this.player.getServer().getBlockManager().getBlocks(),
            ...this.player.getServer().getItemManager().getItems()
        ];

        // Sort based on PmmP Bedrock-data
        creativeitems.forEach((item: any) => {
            pk.entries.push(
                ...entries.filter((entry: any) => {
                    return (
                        entry.meta === (item.damage || 0) &&
                        entry.id === item.id
                    );
                })
            );
        });

        pk.entries = pk.entries.map((block: Block | Item, index: number) => {
            return new CreativeContentEntry(index, block);
        });

        await this.sendDataPacket(pk);
    }

    /**
     * Sets the item in the player hand.
     */
    public async sendHandItem(item: ContainerEntry) {
        const pk = new MobEquipmentPacket();
        pk.runtimeEntityId = this.player.runtimeId;
        pk.item = item;
        pk.inventorySlot = this.player.getInventory().getHandSlotIndex();
        pk.hotbarSlot = this.player.getInventory().getHandSlotIndex();
        pk.windowId = 0; // Inventory ID
        await this.sendDataPacket(pk);
    }

    public async sendTime(time: number) {
        const pk = new SetTimePacket();
        pk.time = time;
        await this.sendDataPacket(pk);
    }

    public async sendGamemode(mode: number) {
        const pk = new SetGamemodePacket();
        pk.gamemode = mode;
        await this.sendDataPacket(pk);
    }

    public async sendNetworkChunkPublisher() {
        const pk = new NetworkChunkPublisherUpdatePacket();
        pk.x = Math.floor(this.player.getX());
        pk.y = Math.floor(this.player.getY());
        pk.z = Math.floor(this.player.getZ());
        pk.radius = this.player.viewDistance << 4;
        await this.sendDataPacket(pk);
    }

    public async sendAvailableCommands() {
        const pk = new AvailableCommandsPacket();

        this.server
            .getCommandManager()
            .getCommandsList()
            .forEach((command) => {
                const classCommand = Array.from(
                    this.server.getCommandManager().getCommands().values()
                ).find((cmd) => cmd.id.split(':')[1] === command[0])!;

                if (command[1].getCommand())
                    pk.commandData.add({
                        name: command[0],
                        description: classCommand.description,
                        parameters: new Set<CommandParameter>()
                    });

                command[2].forEach((arg) => {
                    const parameters = arg
                        .map((parameter) => {
                            if (parameter instanceof CommandArgumentEntity)
                                return [
                                    new CommandParameter({
                                        name: 'target',
                                        type: CommandParameterType.Target,
                                        optional: false
                                    })
                                ];

                            if (
                                parameter instanceof
                                CommandArgumentFloatPosition
                            )
                                return [
                                    new CommandParameter({
                                        name: 'x',
                                        type: CommandParameterType.Float,
                                        optional: false
                                    }),
                                    new CommandParameter({
                                        name: 'y',
                                        type: CommandParameterType.Float,
                                        optional: false
                                    }),
                                    new CommandParameter({
                                        name: 'z',
                                        type: CommandParameterType.Float,
                                        optional: false
                                    })
                                ];
                            if (parameter instanceof CommandArgumentGamemode)
                                return [
                                    new CommandParameter({
                                        name: 'gamemode',
                                        type: CommandParameterType.String,
                                        optional: false
                                    })
                                ];
                            if (parameter instanceof StringArgumentType)
                                return [
                                    new CommandParameter({
                                        name: 'value',
                                        type: CommandParameterType.String,
                                        optional: false
                                    })
                                ];
                            if (parameter instanceof IntegerArgumentType)
                                return [
                                    new CommandParameter({
                                        name: 'number',
                                        type: CommandParameterType.Int,
                                        optional: false
                                    })
                                ];

                            throw new Error(
                                `Invalid parameter ${parameter.constructor.name}`
                            );
                        })
                        .filter((a) => a)
                        .flat();

                    pk.commandData.add({
                        name: command[0],
                        description: classCommand.description,
                        parameters: new Set<CommandParameter>(parameters as any)
                    });
                });
            });

        await this.sendDataPacket(pk);
    }

    // Updates the player view distance
    public async setViewDistance(distance: number) {
        this.player.viewDistance = distance;
        const pk = new ChunkRadiusUpdatedPacket();
        pk.radius = distance;
        await this.sendDataPacket(pk);
    }

    public async sendAttributes(attributes: Attribute[]): Promise<void> {
        const pk = new UpdateAttributesPacket();
        pk.runtimeEntityId = this.player.runtimeId;
        pk.attributes =
            attributes ?? this.player.getAttributeManager().getAttributes();
        pk.tick = BigInt(0); // TODO
        await this.sendDataPacket(pk);
    }

    public async sendMetadata(): Promise<void> {
        const pk = new SetActorDataPacket();
        pk.runtimeEntityId = this.player.runtimeId;
        pk.metadata = this.player.getMetadataManager().getMetadata();
        pk.tick = BigInt(0); // TODO
        await this.sendDataPacket(pk);
    }

    public async sendMessage(
        message: string,
        xuid = '',
        needsTranslation = false
    ) {
        if (!message) throw new Error('A message is required');

        const pk = new TextPacket();
        pk.type = TextType.Raw;
        pk.message = message;
        pk.needsTranslation = needsTranslation;
        pk.xuid = xuid;
        pk.platformChatId = ''; // TODO
        await this.sendDataPacket(pk);
    }

    public async sendChunk(chunk: Chunk) {
        const pk = new LevelChunkPacket();
        pk.chunkX = chunk.getX();
        pk.chunkZ = chunk.getZ();
        pk.subChunkCount = chunk.getSubChunkSendCount();
        pk.data = chunk.toBinary();
        await this.sendDataPacket(pk);

        const hash = CoordinateUtils.encodePos(chunk.getX(), chunk.getZ());
        this.loadedChunks.add(hash);
        this.loadingChunks.delete(hash);
    }

    /**
     * Broadcast the movement to a defined player
     */
    public async broadcastMove(player: Player, mode = MovementType.Normal) {
        const pk = new MovePlayerPacket();
        pk.runtimeEntityId = player.runtimeId;

        pk.positionX = player.getX();
        pk.positionY = player.getY();
        pk.positionZ = player.getZ();

        pk.pitch = player.pitch;
        pk.yaw = player.yaw;
        pk.headYaw = player.headYaw;

        pk.mode = mode;

        pk.onGround = player.isOnGround();

        pk.ridingEntityRuntimeId = BigInt(0);
        pk.tick = BigInt(0); // TODO
        await this.sendDataPacket(pk);
    }

    /**
     * Add the player to the client player list
     */
    public async addToPlayerList() {
        const pk = new PlayerListPacket();
        pk.type = PlayerListAction.TYPE_ADD;

        const entry = new PlayerListEntry({
            uuid: UUID.fromString(this.player.uuid),
            uniqueEntityid: this.player.runtimeId,
            name: this.player.getUsername(),
            xuid: this.player.xuid,
            platformChatId: '', // TODO: read this value from Login
            buildPlatform: -1,
            skin: this.player.skin!,
            isTeacher: false, // TODO: figure out where to read teacher and host
            isHost: false
        });
        pk.entries.push(entry);

        // Add to cached player list
        this.server
            .getPlayerManager()
            .getPlayerList()
            .set(this.player.uuid, entry);

        // Add just this entry for every players on the server
        await Promise.all(
            this.server
                .getPlayerManager()
                .getOnlinePlayers()
                .map(async (player) =>
                    player.getConnection().sendDataPacket(pk)
                )
        );
    }

    /**
     * Removes a player from other players list
     */
    public async removeFromPlayerList() {
        if (!this.player.uuid) return;

        const pk = new PlayerListPacket();
        pk.type = PlayerListAction.TYPE_REMOVE;

        const entry = new PlayerListEntry({
            uuid: UUID.fromString(this.player.getUUID())
        });
        pk.entries.push(entry);

        this.server.getPlayerManager().getPlayerList().delete(this.player.uuid);

        await Promise.all(
            this.server
                .getPlayerManager()
                .getOnlinePlayers()
                .map(async (player) =>
                    player.getConnection().sendDataPacket(pk)
                )
        );
    }

    /**
     * Retrieve all other player in server
     * and add them to the player's in-game player list
     */
    public async sendPlayerList() {
        const pk = new PlayerListPacket();
        pk.type = PlayerListAction.TYPE_ADD;

        // Hack to not compute every time entries
        Array.from(this.server.getPlayerManager().getPlayerList()).forEach(
            ([uuid, entry]) => {
                if (!(uuid === this.player.uuid)) {
                    pk.entries.push(entry);
                }
            }
        );

        await this.sendDataPacket(pk);
    }

    /**
     * Spawn the player to another player
     */
    public async sendSpawn(player: Player) {
        if (!player.getUUID()) {
            this.server
                .getLogger()
                .error(`UUID for player=${player.getUsername()} is undefined`);
            return;
        }

        const pk = new AddPlayerPacket();
        pk.uuid = UUID.fromString(this.player.getUUID()); // TODO: temp solution
        pk.runtimeEntityId = BigInt(this.player.runtimeId);
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

        pk.deviceId = this.player.device?.id || '';
        pk.metadata = this.player.getMetadataManager().getMetadata();
        await player.getConnection().sendDataPacket(pk);
        await this.sendSettings(player);
    }

    /**
     * Despawn the player entity from another player
     */
    public async sendDespawn(player: Player) {
        const pk = new RemoveActorPacket();
        pk.uniqueEntityId = this.player.runtimeId; // We use runtime as unique
        await player.getConnection().sendDataPacket(pk);
    }

    public async sendPlayStatus(status: number) {
        const pk = new PlayStatusPacket();
        pk.status = status;
        await this.sendDataPacket(pk);
    }

    public async kick(reason = 'unknown reason'): Promise<void> {
        const pk = new DisconnectPacket();
        pk.hideDisconnectionWindow = false;
        pk.message = reason;
        await this.sendDataPacket(pk);
    }
}
