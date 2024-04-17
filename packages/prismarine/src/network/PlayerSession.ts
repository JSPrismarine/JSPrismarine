import type { CommandArgument } from '../command/CommandArguments';
import { CommandArgumentEntity, CommandArgumentGamemode } from '../command/CommandArguments';
import type { ChunkCoord } from './packet/NetworkChunkPublisherUpdatePacket';
import NetworkChunkPublisherUpdatePacket from './packet/NetworkChunkPublisherUpdatePacket';
import PlayerListPacket, { PlayerListAction, PlayerListEntry } from './packet/PlayerListPacket';
import UpdateAbilitiesPacket, {
    AbilityLayer,
    AbilityLayerFlag,
    AbilityLayerType
} from './packet/UpdateAbilitiesPacket';
import CommandParameter, { CommandParameterType } from './type/CommandParameter';

import { creativeitems } from '@jsprismarine/bedrock-data';
import Heap from 'heap';
import type Player from '../Player';
import type Server from '../Server';
import type { Attribute } from '../entity/Attribute';
import { WindowIds } from '../inventory/WindowIds';
import { Item } from '../item/Item';
import UUID from '../utils/UUID';
import { Gamemode } from '../world/';
import BlockPosition from '../world/BlockPosition';
import CoordinateUtils from '../world/CoordinateUtils';
import Chunk from '../world/chunk/Chunk';
import type ClientConnection from './ClientConnection';
import type { DataPacket } from './Packets';
import { BatchPacket } from './Packets';
import AddPlayerPacket from './packet/AddPlayerPacket';
import AvailableCommandsPacket from './packet/AvailableCommandsPacket';
import ChunkRadiusUpdatedPacket from './packet/ChunkRadiusUpdatedPacket';
import CreativeContentPacket from './packet/CreativeContentPacket';
import DisconnectPacket from './packet/DisconnectPacket';
import InventoryContentPacket from './packet/InventoryContentPacket';
import LevelChunkPacket from './packet/LevelChunkPacket';
import MobEquipmentPacket from './packet/MobEquipmentPacket';
import MovePlayerPacket from './packet/MovePlayerPacket';
import PlayStatusPacket from './packet/PlayStatusPacket';
import RemoveActorPacket from './packet/RemoveActorPacket';
import SetActorDataPacket from './packet/SetActorDataPacket';
import SetPlayerGameTypePacket from './packet/SetPlayerGameTypePacket';
import SetTimePacket from './packet/SetTimePacket';
import TextPacket from './packet/TextPacket';
import UpdateAdventureSettingsPacket from './packet/UpdateAdventureSettingsPacket';
import UpdateAttributesPacket from './packet/UpdateAttributesPacket';
import CommandData from './type/CommandData';
import { CommandEnum } from './type/CommandEnum';
import MovementType from './type/MovementType';
import PermissionType from './type/PermissionType';
import PlayerPermissionType from './type/PlayerPermissionType';
import TextType from './type/TextType';

export default class PlayerSession {
    private connection: ClientConnection;
    private readonly server: Server;
    private player: Player;

    private readonly chunkSendQueue: Chunk[] = [];
    private readonly loadedChunks: Set<bigint> = new Set();
    private readonly loadingChunks: Set<bigint> = new Set();

    public constructor(server: Server, connection: ClientConnection, player: Player) {
        this.server = server;
        this.connection = connection;
        this.player = player;
    }

    public async update(_tick: number): Promise<void> {
        if (this.chunkSendQueue.length > 0) {
            const chunksToSend = this.chunkSendQueue.splice(0, Math.min(this.chunkSendQueue.length, 50));
            const batch = new BatchPacket();
            for (const chunk of chunksToSend) {
                const pk = new LevelChunkPacket();
                pk.chunkX = chunk.getX();
                pk.chunkZ = chunk.getZ();
                pk.clientSubChunkRequestsEnabled = false;
                pk.subChunkCount = chunk.getTopEmpty() + 4;
                pk.data = chunk.networkSerialize();
                batch.addPacket(pk);

                const hash = Chunk.packXZ(chunk.getX(), chunk.getZ());
                this.loadedChunks.add(hash);
                this.loadingChunks.delete(hash);
            }
            this.connection.sendBatch(batch, false);
        }

        this.player.viewDistance && (await this.needNewChunks());
    }

    public async send(packet: DataPacket) {
        this.connection.sendDataPacket(packet);
    }

    /**
     * Notify a client about change(s) to the adventure settings.
     *
     * @param player - The client-controlled entity
     */
    public async sendSettings(player?: Player): Promise<void> {
        const target = player ?? this.player;

        const pk = new UpdateAdventureSettingsPacket();
        pk.worldImmutable = target.gamemode === Gamemode.Spectator;
        pk.noAttackingPlayers = target.gamemode === Gamemode.Spectator;
        pk.noAttackingMobs = target.gamemode === Gamemode.Spectator;
        pk.autoJump = true; // TODO: grab this info elsewhere
        pk.showNameTags = true; // TODO: player may be able to hide them

        await this.connection.sendDataPacket(pk);
    }

    public async sendAbilities(player?: Player): Promise<void> {
        const target = player ?? this.player;

        const mainLayer = new AbilityLayer();
        mainLayer.layerType = AbilityLayerType.BASE;
        mainLayer.layerFlags = new Map([
            [AbilityLayerFlag.FLY_SPEED, true],
            [AbilityLayerFlag.WALK_SPEED, true],
            [AbilityLayerFlag.MAY_FLY, target.metadata.canFly],
            [AbilityLayerFlag.FLYING, target.isFlying()],
            [AbilityLayerFlag.NO_CLIP, target.gamemode === Gamemode.Spectator],
            [AbilityLayerFlag.OPERATOR_COMMANDS, target.isOp()],
            [AbilityLayerFlag.TELEPORT, target.isOp()],
            [AbilityLayerFlag.INVULNERABLE, target.gamemode === Gamemode.Creative],
            [AbilityLayerFlag.MUTED, false],
            [AbilityLayerFlag.WORLD_BUILDER, false],
            [AbilityLayerFlag.INSTABUILD, target.gamemode === Gamemode.Creative],
            [AbilityLayerFlag.LIGHTNING, false],
            [AbilityLayerFlag.BUILD, target.gamemode !== Gamemode.Spectator],
            [AbilityLayerFlag.MINE, target.gamemode !== Gamemode.Spectator],
            [AbilityLayerFlag.DOORS_AND_SWITCHES, target.gamemode !== Gamemode.Spectator],
            [AbilityLayerFlag.OPEN_CONTAINERS, target.gamemode !== Gamemode.Spectator],
            [AbilityLayerFlag.ATTACK_PLAYERS, target.gamemode !== Gamemode.Spectator],
            [AbilityLayerFlag.ATTACK_MOBS, target.gamemode !== Gamemode.Spectator]
        ]);
        mainLayer.flySpeed = 0.05;
        mainLayer.walkSpeed = 0.1;

        const packet = new UpdateAbilitiesPacket();
        packet.commandPermission = target.isOp() ? PermissionType.Operator : PermissionType.Normal;
        packet.playerPermission = target.isOp() ? PlayerPermissionType.Operator : PlayerPermissionType.Member;
        packet.targetActorUniqueId = target.getRuntimeId();
        packet.abilityLayers = [mainLayer];
        await this.send(packet);
    }

    public async needNewChunks(forceResend = false, dist?: number): Promise<void> {
        const currentXChunk = CoordinateUtils.fromBlockToChunk(this.player.getX());
        const currentZChunk = CoordinateUtils.fromBlockToChunk(this.player.getZ());

        const viewDistance = this.player.viewDistance || dist || 0;

        const chunksToSendHeap = new Heap((a: number[], b: number[]) => {
            const distXFirst = Math.abs(a[0]! - currentXChunk);
            const distXSecond = Math.abs(b[0]! - currentXChunk);

            const distZFirst = Math.abs(a[1]! - currentZChunk);
            const distZSecond = Math.abs(b[1]! - currentZChunk);

            return distXFirst + distZFirst > distXSecond + distZSecond ? 1 : -1;
        });

        for (let sendXChunk = -viewDistance; sendXChunk <= viewDistance; sendXChunk++) {
            for (let sendZChunk = -viewDistance; sendZChunk <= viewDistance; sendZChunk++) {
                if (sendXChunk * sendXChunk + sendZChunk * sendZChunk > viewDistance * viewDistance) continue; // early exit if chunk is outside of view distance
                const newChunk = [currentXChunk + sendXChunk, currentZChunk + sendZChunk];
                const hash = Chunk.packXZ(newChunk[0]!, newChunk[1]!);

                if (forceResend) {
                    chunksToSendHeap.push(newChunk);
                } else if (!this.loadedChunks.has(hash) && !this.loadingChunks.has(hash)) {
                    chunksToSendHeap.push(newChunk);
                }
            }
        }

        while (chunksToSendHeap.size() > 0) {
            const closestChunk = chunksToSendHeap.pop()!;
            const hash = Chunk.packXZ(closestChunk[0]!, closestChunk[1]!);
            if (forceResend) {
                if (!this.loadedChunks.has(hash) && !this.loadingChunks.has(hash)) {
                    this.loadingChunks.add(hash);
                    await this.requestChunk(closestChunk[0]!, closestChunk[1]!);
                } else {
                    const loadedChunk = await this.player.getWorld().getChunk(closestChunk[0]!, closestChunk[1]!);
                    await this.sendChunk(loadedChunk);
                }
            } else {
                this.loadingChunks.add(hash);
                await this.requestChunk(closestChunk[0]!, closestChunk[1]!);
            }
        }

        let unloaded = false;

        for (const hash of this.loadedChunks) {
            const [x, z] = Chunk.unpackXZ(hash);

            if (Math.abs(x! - currentXChunk) > viewDistance || Math.abs(z! - currentZChunk) > viewDistance) {
                unloaded = true;
                this.loadedChunks.delete(hash);
            }
        }

        for (const hash of this.loadingChunks) {
            const [x, z] = Chunk.unpackXZ(hash);

            if (Math.abs(x! - currentXChunk) > viewDistance || Math.abs(z! - currentZChunk) > viewDistance) {
                this.loadingChunks.delete(hash);
            }
        }

        if (!unloaded && this.chunkSendQueue.length !== 0) {
            await this.sendNetworkChunkPublisher(dist ?? viewDistance, []);
        }
    }

    public async requestChunk(x: number, z: number): Promise<void> {
        const chunk = await this.player.getWorld().getChunk(x, z);
        this.chunkSendQueue.push(chunk);
    }

    /**
     * Clear the currently loaded and loading chunks.
     *
     * @remarks
     * Usually used for changing dimension, world, etc.
     */
    public async clearChunks() {
        this.loadedChunks.clear();
        this.loadingChunks.clear();
    }

    /**
     * @TODO: Implement this.
     */
    public async sendInventory(): Promise<void> {
        const pk = new InventoryContentPacket();
        pk.items = this.player.getInventory().getItems(true);
        pk.windowId = WindowIds.INVENTORY; // Inventory window
        //await this.connection.sendDataPacket(pk);
        //await this.sendHandItem(this.player.getInventory().getItemInHand());
    }

    public async sendCreativeContents(empty = false): Promise<void> {
        const pk = new CreativeContentPacket();
        if (empty) {
            await this.connection.sendDataPacket(pk);
            return;
        }

        const entries = [
            ...this.player.getServer().getBlockManager().getBlocks(),
            ...this.player.getServer().getItemManager().getItems()
        ];

        // Sort based on PmmP Bedrock-data
        creativeitems.forEach((item: any) => {
            pk.items.push(
                ...entries
                    .filter((entry: any) => {
                        return entry.meta === (item.damage ?? 0) && entry.getId() === item.id;
                    })
                    .map(
                        (entry) =>
                            new Item({
                                id: entry.getId(),
                                name: entry.getName(),
                                meta: entry.meta
                            })
                    )
            );
        });

        await this.connection.sendDataPacket(pk);
    }

    /**
     * Sets the item in the player hand.
     *
     * @param item - The entity.
     */
    public async sendHandItem(item: Item): Promise<void> {
        const pk = new MobEquipmentPacket();
        pk.runtimeEntityId = this.player.getRuntimeId();
        pk.item = item;
        pk.inventorySlot = this.player.getInventory().getHandSlotIndex();
        pk.hotbarSlot = this.player.getInventory().getHandSlotIndex();
        pk.windowId = 0; // Inventory ID
        await this.connection.sendDataPacket(pk);
    }

    /**
     * Set the client's current tick.
     *
     * @param tick - The tick
     */
    public async sendTime(tick: number): Promise<void> {
        const pk = new SetTimePacket();
        pk.time = tick;
        await this.connection.sendDataPacket(pk);
    }

    /**
     * Set the client's gamemode.
     * @param {number} gamemode - the numeric gamemode ID.
     */
    public async sendGamemode(gamemode: number): Promise<void> {
        const pk = new SetPlayerGameTypePacket();
        pk.gamemode = gamemode;
        await this.connection.sendDataPacket(pk);
    }

    public async sendNetworkChunkPublisher(distance: number, savedChunks: ChunkCoord[]): Promise<void> {
        const pk = new NetworkChunkPublisherUpdatePacket();
        pk.position = BlockPosition.fromVector3(this.player.getPosition());
        pk.radius = distance << 4;
        pk.savedChunks = savedChunks;
        await this.connection.sendDataPacket(pk);
    }

    public async sendAvailableCommands(): Promise<void> {
        const playerEnum = new CommandEnum();
        playerEnum.soft = true;
        playerEnum.name = 'Player';
        playerEnum.values = this.player
            .getServer()
            .getSessionManager()
            .getAllPlayers()
            .map((player) => player.getName());

        const pk = new AvailableCommandsPacket();
        pk.softEnums = [playerEnum];
        this.server
            .getCommandManager()
            .getCommandsList()
            .forEach((command) => {
                const commandClass = Array.from(this.server.getCommandManager().getCommands().values()).find(
                    (cmd) => cmd.name === command[0]
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
                    cmdAliases.name = `${command[0]}Aliases`;
                    cmdAliases.values = commandClass.aliases!.concat(command[0]);
                    cmd.aliases = cmdAliases;
                }

                command[2].forEach((arg, index) => {
                    const parameters = arg
                        .map((parameter: CommandArgument | null) => {
                            if (!parameter || !(parameter as any)?.getParameters) return [];

                            const parameters = parameter.getParameters(this.server);
                            if (parameters) return Array.from(parameters.values());

                            if (parameter instanceof CommandArgumentEntity)
                                return [
                                    new CommandParameter({
                                        paramName: 'target',
                                        paramType: CommandParameterType.Target
                                    })
                                ];
                            if (parameter instanceof CommandArgumentGamemode)
                                return [
                                    new CommandParameter({
                                        paramName: 'gamemode',
                                        paramType: CommandParameterType.String
                                    })
                                ];
                            if (parameter.constructor.name === 'StringArgumentType')
                                return [
                                    new CommandParameter({
                                        paramName: 'value',
                                        paramType: CommandParameterType.String
                                    })
                                ];
                            if (parameter.constructor.name === 'IntegerArgumentType')
                                return [
                                    new CommandParameter({
                                        paramName: 'number',
                                        paramType: CommandParameterType.Int
                                    })
                                ];

                            this.server.getLogger().warn(`Invalid parameter ${parameter.constructor.name}`);
                            return [
                                new CommandParameter({
                                    paramName: 'value',
                                    paramType: CommandParameterType.String
                                })
                            ];
                        })
                        .flat();
                    cmd.overloads[index] = parameters;
                });
                pk.commandData.push(cmd);
            });

        await this.getConnection().sendDataPacket(pk);
    }

    /**
     * Set the client's maximum view distance.
     *
     * @param distance - The view distance
     */
    public async setViewDistance(distance: number): Promise<void> {
        this.player.viewDistance = distance;
        const pk = new ChunkRadiusUpdatedPacket();
        pk.radius = distance;
        await this.connection.sendDataPacket(pk);
    }

    public async sendAttributes(attributes: Attribute[]): Promise<void> {
        const pk = new UpdateAttributesPacket();
        pk.runtimeEntityId = this.player.getRuntimeId();
        pk.attributes = attributes.length > 0 ? attributes : this.player.getAttributeManager().getAttributes();
        pk.tick = BigInt(this.player.getServer().getTick());
        await this.connection.sendDataPacket(pk);
    }

    public async sendMetadata(): Promise<void> {
        const pk = new SetActorDataPacket();
        pk.runtimeEntityId = this.player.getRuntimeId();
        pk.metadata = this.player.metadata;
        pk.tick = BigInt(this.player.getServer().getTick());
        await this.connection.sendDataPacket(pk);
    }

    /**
     * Send a chat message to the client.
     * @param {object} options - The options for the message.
     * @param {string} options.message - The message to send.
     * @param {string} [options.sourceName=''] - The source of the message.
     * @param {string} [options.xuid=''] - The XUID of the player.
     * @param {string} [options.platformChatId=''] - The platform chat ID.
     * @param {string[]} [options.parameters=[]] - The parameters for the message.
     * @param {boolean} [options.needsTranslation=false] - Whether the message needs translation.
     * @param {TextType} [options.type=TextType.Raw] - The type of the message.
     * @returns {Promise<void>} A promise that resolves when the message is sent.
     */
    public async sendMessage({
        message,
        sourceName = '',
        xuid = '',
        platformChatId = '',
        parameters = [],
        needsTranslation = false,
        type = TextType.Raw
    }: {
        message: string;
        sourceName?: string;
        xuid?: string;
        platformChatId?: string;
        parameters?: string[];
        needsTranslation?: boolean;
        type?: TextType;
    }): Promise<void> {
        if (!message) throw new Error('A message is required');

        const pk = new TextPacket();
        pk.message = message;
        pk.sourceName = sourceName;
        pk.xuid = xuid;
        pk.platformChatId = platformChatId;
        pk.parameters = parameters;
        pk.needsTranslation = needsTranslation;
        pk.type = type;
        await this.connection.sendDataPacket(pk);
    }

    public async sendChunk(chunk: Chunk): Promise<void> {
        const pk = new LevelChunkPacket();
        pk.chunkX = chunk.getX();
        pk.chunkZ = chunk.getZ();
        pk.clientSubChunkRequestsEnabled = false;
        pk.subChunkCount = chunk.getTopEmpty() + 4; // add the useless layers hack
        pk.data = chunk.networkSerialize();
        await this.connection.sendDataPacket(pk, undefined, false);

        const hash = Chunk.packXZ(chunk.getX(), chunk.getZ());
        this.loadedChunks.add(hash);
        this.loadingChunks.delete(hash);
    }

    /**
     * Broadcast the movement to a defined player
     */
    public async broadcastMove(player: Player, mode = MovementType.Normal): Promise<void> {
        const packet = new MovePlayerPacket();
        packet.runtimeEntityId = player.getRuntimeId();

        packet.position = player.getPosition();
        packet.pitch = player.pitch;
        packet.yaw = player.yaw;
        packet.headYaw = player.headYaw;

        packet.mode = mode;

        packet.onGround = player.isOnGround();

        // TODO
        if (mode === MovementType.Teleport) {
            packet.teleportCause = 0;
            packet.teleportItemId = 0;
        }

        packet.ridingEntityRuntimeId = BigInt(0);
        packet.tick = BigInt(this.player.getServer().getTick());
        await this.send(packet);
    }

    /**
     * Adds the client to the player list of every player inside
     * the server and also to the player itself.
     */
    public async addToPlayerList(): Promise<void> {
        const entry = new PlayerListEntry({
            uuid: UUID.fromString(this.player.getUUID()),
            runtimeId: this.player.getRuntimeId(),
            name: this.player.getName(),
            xuid: this.player.xuid,
            platformChatId: '', // TODO: read this value from Login
            buildPlatform: this.player.device ? this.player.device.os : -1,
            skin: this.player.skin!,
            isTeacher: false, // TODO: figure out where to read teacher and host
            isHost: false
        });

        const packet = new PlayerListPacket();
        packet.type = PlayerListAction.TYPE_ADD;
        packet.entries.push(entry);
        await this.server.broadcastPacket(packet);

        this.server.getSessionManager().getPlayerList().set(this.player.getUUID(), entry);
    }

    /**
     * Removes a player from other players list
     */
    public async removeFromPlayerList(): Promise<void> {
        const pk = new PlayerListPacket();
        pk.type = PlayerListAction.TYPE_REMOVE;

        const entry = new PlayerListEntry({
            uuid: UUID.fromString(this.player.getUUID())
        });
        pk.entries.push(entry);

        this.server.getSessionManager().getPlayerList().delete(this.player.getUUID());

        await Promise.all(
            this.server
                .getSessionManager()
                .getAllPlayers()
                .map(async (player) => player.getNetworkSession().getConnection().sendDataPacket(pk))
        );
    }

    /**
     * Sends the full player list to the player.
     */
    public async sendPlayerList(): Promise<void> {
        const playerList = new PlayerListPacket();
        playerList.type = PlayerListAction.TYPE_ADD;
        playerList.entries = Array.from(this.server.getSessionManager().getPlayerList().values());
        await this.connection.sendDataPacket(playerList);
    }

    /**
     * Spawn the player for another player
     *
     * @param player - the player to send the AddPlayerPacket to
     */
    public async sendSpawn(player: Player): Promise<void> {
        if (!player.getUUID()) {
            this.server.getLogger().error(`UUID for player ${player.getName()} is undefined`);
            return;
        }

        const pk = new AddPlayerPacket();
        pk.uuid = UUID.fromString(this.player.getUUID()); // TODO: temp solution
        pk.runtimeEntityId = this.player.getRuntimeId();
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

        pk.gamemode = this.player.gamemode;
        pk.item = this.player.getInventory().getItemInHand();

        pk.deviceId = this.player.device?.id ?? '';
        pk.metadata = this.player.metadata;
        await player.getNetworkSession().getConnection().sendDataPacket(pk);
        // TODO: await this.sendSettings(player);
    }

    /**
     * Despawn the player entity from another player
     */
    public async sendDespawn(player: Player): Promise<void> {
        const pk = new RemoveActorPacket();
        pk.uniqueEntityId = this.player.getRuntimeId(); // We use runtime as unique
        await player.getNetworkSession().getConnection().sendDataPacket(pk);
    }

    public async sendPlayStatus(status: number): Promise<void> {
        const pk = new PlayStatusPacket();
        pk.status = status;
        await this.connection.sendDataPacket(pk, true);
    }

    public async kick(reason = 'unknown reason'): Promise<void> {
        const pk = new DisconnectPacket();
        pk.skipMessage = false;
        pk.message = reason;
        await this.connection.sendDataPacket(pk, true);
    }

    public getConnection(): ClientConnection {
        return this.connection;
    }

    public getPlayer(): Player {
        return this.player;
    }
}
