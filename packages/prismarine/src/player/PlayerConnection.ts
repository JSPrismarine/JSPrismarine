import AdventureSettingsPacket, { AdventureSettingsFlags } from '../network/packet/AdventureSettingsPacket';
import { CommandArgumentEntity, CommandArgumentGamemode } from '../command/CommandArguments';
import CommandParameter, { CommandParameterType } from '../network/type/CommandParameter';
import { Connection, Protocol } from '@jsprismarine/raknet';
import PlayerListPacket, { PlayerListAction, PlayerListEntry } from '../network/packet/PlayerListPacket';

import AddPlayerPacket from '../network/packet/AddPlayerPacket';
import Air from '../block/blocks/Air';
import { Attribute } from '../entity/Attribute';
import AvailableCommandsPacket from '../network/packet/AvailableCommandsPacket';
import BatchPacket from '../network/packet/BatchPacket';
import Block from '../block/Block';
import Chunk from '../world/chunk/Chunk';
import ChunkRadiusUpdatedPacket from '../network/packet/ChunkRadiusUpdatedPacket';
import CommandData from '../network/type/CommandData';
import CommandEnum from '../network/type/CommandEnum';
import ContainerEntry from '../inventory/ContainerEntry';
import CoordinateUtils from '../world/CoordinateUtils';
import CreativeContentEntry from '../network/type/CreativeContentEntry';
import CreativeContentPacket from '../network/packet/CreativeContentPacket';
import DataPacket from '../network/packet/DataPacket';
import DisconnectPacket from '../network/packet/DisconnectPacket';
import Gamemode from '../world/Gamemode';
import IForm from '../form/IForm';
import InventoryContentPacket from '../network/packet/InventoryContentPacket';
import Item from '../item/Item';
import LevelChunkPacket from '../network/packet/LevelChunkPacket';
import MobEquipmentPacket from '../network/packet/MobEquipmentPacket';
import ModalFormRequestPacket from '../network/packet/ModalFormRequestPacket';
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
import SetPlayerGameTypePacket from '../network/packet/SetPlayerGameTypePacket';
import SetTimePacket from '../network/packet/SetTimePacket';
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

    public constructor(server: Server, connection: Connection, player: Player) {
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
        const sendPacket = new Protocol.EncapsulatedPacket();
        sendPacket.reliability = 0;
        sendPacket.buffer = batch.getBuffer();

        await this.connection.addEncapsulatedToQueue(sendPacket);
        this.server.getLogger().silly(`Sent §b${packet.constructor.name}§r packet`, 'PlayerConnection/sendDataPacket');
    }

    public async update(_tick: number): Promise<void> {
        if (this.chunkSendQueue.size > 0) {
            for (const chunk of this.chunkSendQueue) {
                const encodedPos = CoordinateUtils.encodePos(chunk.getX(), chunk.getZ());
                if (!this.loadingChunks.has(encodedPos)) {
                    this.chunkSendQueue.delete(chunk);
                }

                await this.sendChunk(chunk);
                this.chunkSendQueue.delete(chunk);
            }
        }

        await this.needNewChunks();
    }

    public async sendSettings(player?: Player): Promise<void> {
        const target = player ?? this.player;
        const pk = new AdventureSettingsPacket();

        pk.setFlag(AdventureSettingsFlags.WorldImmutable, target.gamemode === 3);
        pk.setFlag(AdventureSettingsFlags.NoPvp, target.gamemode === Gamemode.Spectator);
        pk.setFlag(AdventureSettingsFlags.AutoJump, true); // TODO
        pk.setFlag(AdventureSettingsFlags.AllowFlight, target.getAllowFlight());
        pk.setFlag(AdventureSettingsFlags.NoClip, target.gamemode === Gamemode.Spectator);
        pk.setFlag(AdventureSettingsFlags.Flying, target.isFlying());

        pk.commandPermission = target.isOp() ? PermissionType.Operator : PermissionType.Normal;
        pk.playerPermission = target.isOp() ? PlayerPermissionType.Operator : PlayerPermissionType.Member;
        pk.entityId = target.runtimeId;
        await this.sendDataPacket(pk);
    }

    public async needNewChunks(forceResend = false): Promise<void> {
        const currentXChunk = CoordinateUtils.fromBlockToChunk(this.player.getX());
        const currentZChunk = CoordinateUtils.fromBlockToChunk(this.player.getZ());

        const viewDistance = this.player.viewDistance;
        const chunksToSend: number[][] = [];

        for (let sendXChunk = -viewDistance; sendXChunk <= viewDistance; sendXChunk++) {
            for (let sendZChunk = -viewDistance; sendZChunk <= viewDistance; sendZChunk++) {
                const chunkDistance = Math.round(Math.sqrt(sendZChunk * sendZChunk + sendXChunk * sendXChunk));

                if (chunkDistance <= viewDistance) {
                    const newChunk = [currentXChunk + sendXChunk, currentZChunk + sendZChunk];
                    const hash = CoordinateUtils.encodePos(newChunk[0], newChunk[1]);

                    if (forceResend) {
                        chunksToSend.push(newChunk);
                    } else if (!this.loadedChunks.has(hash) && !this.loadingChunks.has(hash)) {
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
                if (!this.loadedChunks.has(hash) && !this.loadingChunks.has(hash)) {
                    this.loadingChunks.add(hash);
                    await this.requestChunk(chunk[0], chunk[1]);
                } else {
                    const loadedChunk = await this.player.getWorld().getChunk(chunk[0], chunk[1]);
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

            if (Math.abs(x - currentXChunk) > viewDistance || Math.abs(z - currentZChunk) > viewDistance) {
                unloaded = true;
                this.loadedChunks.delete(hash);
            }
        }

        for (const hash of this.loadingChunks) {
            const [x, z] = CoordinateUtils.decodePos(hash);

            if (Math.abs(x - currentXChunk) > viewDistance || Math.abs(z - currentZChunk) > viewDistance) {
                this.loadingChunks.delete(hash);
            }
        }

        if (unloaded ?? !(this.chunkSendQueue.size === 0)) {
            await this.sendNetworkChunkPublisher();
        }
    }

    public async requestChunk(x: number, z: number): Promise<void> {
        const chunk = await this.player.getWorld().getChunk(x, z);
        this.chunkSendQueue.add(chunk);
    }

    public async sendInventory(): Promise<void> {
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

    public async sendCreativeContents(empty = false): Promise<void> {
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
                    return entry.meta === (item.damage || 0) && entry.id === item.id;
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
    public async sendHandItem(item: ContainerEntry): Promise<void> {
        const pk = new MobEquipmentPacket();
        pk.runtimeEntityId = this.player.runtimeId;
        pk.item = item;
        pk.inventorySlot = this.player.getInventory().getHandSlotIndex();
        pk.hotbarSlot = this.player.getInventory().getHandSlotIndex();
        pk.windowId = 0; // Inventory ID
        await this.sendDataPacket(pk);
    }

    public async sendForm(form: IForm): Promise<void> {
        const id = this.player.getFormManager().addForm(form);
        const pk = new ModalFormRequestPacket();
        pk.formId = id;
        pk.formData = form.jsonSerialize();
        await this.sendDataPacket(pk);
    }

    public async sendTime(time: number): Promise<void> {
        const pk = new SetTimePacket();
        pk.time = time;
        await this.sendDataPacket(pk);
    }

    public async sendGamemode(mode: number): Promise<void> {
        const pk = new SetPlayerGameTypePacket();
        pk.gamemode = mode;
        await this.sendDataPacket(pk);
    }

    public async sendNetworkChunkPublisher(): Promise<void> {
        const pk = new NetworkChunkPublisherUpdatePacket();
        pk.x = Math.floor(this.player.getX());
        pk.y = Math.floor(this.player.getY());
        pk.z = Math.floor(this.player.getZ());
        pk.radius = this.player.viewDistance << 4;
        await this.sendDataPacket(pk);
    }

    public async sendAvailableCommands(): Promise<void> {
        const pk = new AvailableCommandsPacket();

        this.server
            .getCommandManager()
            .getCommandsList()
            .forEach((command) => {
                const commandClass = Array.from(this.server.getCommandManager().getCommands().values()).find(
                    (cmd) => cmd.id.split(':')[1] === command[0]
                );

                if (!commandClass) {
                    this.player
                        .getServer()
                        .getLogger()
                        .warn(`Can't find corresponding command class for "${command[0]}"`);
                    return;
                }

                if (!this.player.getServer().getPermissionManager().can(this.player).execute(commandClass.permission))
                    return;

                const cmd = new CommandData();
                cmd.commandName = command[0];
                cmd.commandDescription = commandClass.description;
                if (commandClass.aliases!.length > 0) {
                    const cmdAliases = new CommandEnum();
                    cmdAliases.enumName = `${command[0]}Aliases`;
                    cmdAliases.enumValues = commandClass.aliases!.concat(command[0]);
                    cmd.aliases = cmdAliases;
                }

                command[2].forEach((arg, index) => {
                    const parameters = arg
                        .map((parameter) => {
                            const parameters = parameter?.getParameters?.();
                            if (parameters) return Array.from(parameters.values());

                            if (parameter instanceof CommandArgumentEntity)
                                return [new CommandParameter('target', CommandParameterType.Target)];

                            if (parameter instanceof CommandArgumentGamemode)
                                return [new CommandParameter('gamemode', CommandParameterType.String)];
                            if (parameter.constructor.name === 'StringArgumentType')
                                return [new CommandParameter('value', CommandParameterType.String)];
                            if (parameter.constructor.name === 'IntegerArgumentType')
                                return [new CommandParameter('number', CommandParameterType.Int)];

                            this.server.getLogger().warn(`Invalid parameter ${parameter.constructor.name}`);
                            return [new CommandParameter('value', CommandParameterType.String)];
                        })
                        .filter((a) => a)
                        .flat();
                    cmd.overloads[index] = parameters;
                });
                pk.commandData.push(cmd);
            });
        await this.sendDataPacket(pk);
    }

    // Updates the player view distance
    public async setViewDistance(distance: number): Promise<void> {
        this.player.viewDistance = distance;
        const pk = new ChunkRadiusUpdatedPacket();
        pk.radius = distance;
        await this.sendDataPacket(pk);
    }

    public async sendAttributes(attributes: Attribute[]): Promise<void> {
        const pk = new UpdateAttributesPacket();
        pk.runtimeEntityId = this.player.runtimeId;
        pk.attributes = attributes ?? this.player.getAttributeManager().getAttributes();
        pk.tick = BigInt(0); // TODO
        await this.sendDataPacket(pk);
    }

    public async sendMetadata(): Promise<void> {
        const pk = new SetActorDataPacket();
        pk.runtimeEntityId = this.player.runtimeId;
        pk.metadata = this.player.getMetadataManager();
        pk.tick = BigInt(0); // TODO
        await this.sendDataPacket(pk);
    }

    public async sendMessage(message: string, xuid = '', needsTranslation = false): Promise<void> {
        if (!message) throw new Error('A message is required');

        const pk = new TextPacket();
        pk.type = TextType.Raw;
        pk.message = message;
        pk.needsTranslation = needsTranslation;
        pk.xuid = xuid;
        pk.platformChatId = ''; // TODO
        await this.sendDataPacket(pk);
    }

    public async sendChunk(chunk: Chunk): Promise<void> {
        const pk = new LevelChunkPacket();
        pk.chunkX = chunk.getX();
        pk.chunkZ = chunk.getZ();
        pk.subChunkCount = chunk.getTopEmpty();
        pk.data = chunk.networkSerialize();
        await this.sendDataPacket(pk);

        const hash = CoordinateUtils.encodePos(chunk.getX(), chunk.getZ());
        this.loadedChunks.add(hash);
        this.loadingChunks.delete(hash);
    }

    /**
     * Broadcast the movement to a defined player
     */
    public async broadcastMove(player: Player, mode = MovementType.Normal): Promise<void> {
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
    public async addToPlayerList(): Promise<void> {
        const pk = new PlayerListPacket();
        pk.type = PlayerListAction.TYPE_ADD;

        const entry = new PlayerListEntry({
            uuid: UUID.fromString(this.player.uuid),
            uniqueEntityid: this.player.runtimeId,
            name: this.player.getName(),
            xuid: this.player.xuid,
            platformChatId: '', // TODO: read this value from Login
            buildPlatform: -1,
            skin: this.player.skin!,
            isTeacher: false, // TODO: figure out where to read teacher and host
            isHost: false
        });
        pk.entries.push(entry);

        // Add to cached player list
        this.server.getPlayerManager().getPlayerList().set(this.player.uuid, entry);

        // Add just this entry for every players on the server
        await Promise.all(
            this.server
                .getPlayerManager()
                .getOnlinePlayers()
                .map(async (player) => player.getConnection().sendDataPacket(pk))
        );
    }

    /**
     * Removes a player from other players list
     */
    public async removeFromPlayerList(): Promise<void> {
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
                .map(async (player) => player.getConnection().sendDataPacket(pk))
        );
    }

    /**
     * Retrieve all other player in server
     * and add them to the player's in-game player list
     */
    public async sendPlayerList(): Promise<void> {
        const pk = new PlayerListPacket();
        pk.type = PlayerListAction.TYPE_ADD;

        // Hack to not compute every time entries
        Array.from(this.server.getPlayerManager().getPlayerList()).forEach(([uuid, entry]) => {
            if (!(uuid === this.player.uuid)) {
                pk.entries.push(entry);
            }
        });

        await this.sendDataPacket(pk);
    }

    /**
     * Spawn the player for another player
     *
     * @param player the player to send the AddPlayerPacket to
     */
    public async sendSpawn(player: Player): Promise<void> {
        if (!player.getUUID()) {
            this.server.getLogger().error(`UUID for player ${player.getName()} is undefined`);
            return;
        }

        const pk = new AddPlayerPacket();
        pk.uuid = UUID.fromString(this.player.getUUID()); // TODO: temp solution
        pk.runtimeEntityId = this.player.runtimeId;
        pk.name = this.player.getName();

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

        pk.item = this.player.getInventory()?.getItemInHand() ?? new ContainerEntry({ item: new Air(), count: 0 });

        pk.deviceId = this.player.device?.id ?? '';
        pk.metadata = this.player.getMetadataManager();
        await player.getConnection().sendDataPacket(pk);
        await this.sendSettings(player);
    }

    /**
     * Despawn the player entity from another player
     */
    public async sendDespawn(player: Player): Promise<void> {
        const pk = new RemoveActorPacket();
        pk.uniqueEntityId = this.player.runtimeId; // We use runtime as unique
        await player.getConnection().sendDataPacket(pk);
    }

    public async sendPlayStatus(status: number): Promise<void> {
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
