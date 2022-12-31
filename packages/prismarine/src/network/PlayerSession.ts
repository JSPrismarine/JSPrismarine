import UpdateAdventureSettingsPacket from './packet/UpdateAdventureSettingsPacket';
import { CommandArgumentEntity, CommandArgumentGamemode } from '../command/CommandArguments';
import CommandParameter, { CommandParameterType } from './type/CommandParameter';
import PlayerListPacket, { PlayerListAction, PlayerListEntry } from './packet/PlayerListPacket';

import AddPlayerPacket from './packet/AddPlayerPacket';
import Air from '../block/blocks/Air';
import { Attribute } from '../entity/Attribute';
import AvailableCommandsPacket from './packet/AvailableCommandsPacket';
import Block from '../block/Block';
import Chunk from '../world/chunk/Chunk';
import ChunkRadiusUpdatedPacket from './packet/ChunkRadiusUpdatedPacket';
import ClientConnection from './ClientConnection';
import CommandData from './type/CommandData';
import CommandEnum from './type/CommandEnum';
import ContainerEntry from '../inventory/ContainerEntry';
import CoordinateUtils from '../world/CoordinateUtils';
import CreativeContentEntry from './type/CreativeContentEntry';
import CreativeContentPacket from './packet/CreativeContentPacket';
import DisconnectPacket from './packet/DisconnectPacket';
import Gamemode from '../world/Gamemode';
import IForm from '../form/IForm';
import InventoryContentPacket from './packet/InventoryContentPacket';
import Item from '../item/Item';
import LevelChunkPacket from './packet/LevelChunkPacket';
import MobEquipmentPacket from './packet/MobEquipmentPacket';
import ModalFormRequestPacket from './packet/ModalFormRequestPacket';
import MovePlayerPacket from './packet/MovePlayerPacket';
import MovementType from './type/MovementType';
import NetworkChunkPublisherUpdatePacket from './packet/NetworkChunkPublisherUpdatePacket';
import PermissionType from './type/PermissionType';
import PlayStatusPacket from './packet/PlayStatusPacket';
import type Player from '../player/Player';
import PlayerPermissionType from './type/PlayerPermissionType';
import RemoveActorPacket from './packet/RemoveActorPacket';
import type Server from '../Server';
import SetActorDataPacket from './packet/SetActorDataPacket';
import SetPlayerGameTypePacket from './packet/SetPlayerGameTypePacket';
import SetTimePacket from './packet/SetTimePacket';
import TextPacket from './packet/TextPacket';
import TextType from './type/TextType';
import UUID from '../utils/UUID';
import UpdateAttributesPacket from './packet/UpdateAttributesPacket';
import { WindowIds } from '../inventory/WindowManager';
import UpdateAbilitiesPacket, {
    AbilityLayer,
    AbilityLayerFlag,
    AbilityLayerType
} from './packet/UpdateAbilitiesPacket';

const { creativeitems } = require('@jsprismarine/bedrock-data');

export default class PlayerSession {
    private connection: ClientConnection;
    private readonly server: Server;
    private player: Player;

    private readonly chunkSendQueue: Set<Chunk> = new Set();
    private readonly loadedChunks: Set<string> = new Set();
    private readonly loadingChunks: Set<string> = new Set();

    public constructor(server: Server, connection: ClientConnection, player: Player) {
        this.server = server;
        this.connection = connection;
        this.player = player;
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

    /**
     * Notify a client about change(s) to the adventure settings.
     *
     * @param player The client-controlled entity
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

        const pk = new UpdateAbilitiesPacket();
        pk.commandPermission = target.isOp() ? PermissionType.Operator : PermissionType.Normal;
        pk.playerPermission = target.isOp() ? PlayerPermissionType.Operator : PlayerPermissionType.Member;
        pk.targetActorUniqueId = target.getRuntimeId();

        const mainLayer = new AbilityLayer();
        mainLayer.layerType = AbilityLayerType.BASE;
        mainLayer.layerFlags = new Map([
            [AbilityLayerFlag.FLY_SPEED, true],
            [AbilityLayerFlag.WALK_SPEED, true],
            [AbilityLayerFlag.MAY_FLY, target.getAllowFlight()],
            [AbilityLayerFlag.FLYING, target.isFlying()],
            [AbilityLayerFlag.NO_CLIP, target.gamemode === Gamemode.Spectator],
            [AbilityLayerFlag.OPERATOR_COMMANDS, target.isOp()],
            [AbilityLayerFlag.TELEPORT, target.isOp()],
            [AbilityLayerFlag.INVULNERABLE, target.gamemode === Gamemode.Creative],
            [AbilityLayerFlag.MUTED, false],
            [AbilityLayerFlag.WORLD_BUILDER, false],
            [AbilityLayerFlag.INSTABUILD, target.gamemode === Gamemode.Creative],
            [AbilityLayerFlag.LIGHTNING, false],
            [AbilityLayerFlag.BUILD, !(target.gamemode === Gamemode.Spectator)],
            [AbilityLayerFlag.MINE, !(target.gamemode === Gamemode.Spectator)],
            [AbilityLayerFlag.DOORS_AND_SWITCHES, !(target.gamemode === Gamemode.Spectator)],
            [AbilityLayerFlag.OPEN_CONTAINERS, !(target.gamemode === Gamemode.Spectator)],
            [AbilityLayerFlag.ATTACK_PLAYERS, !(target.gamemode === Gamemode.Spectator)],
            [AbilityLayerFlag.ATTACK_MOBS, !(target.gamemode === Gamemode.Spectator)]
        ]);
        mainLayer.flySpeed = 0.05;
        mainLayer.walkSpeed = 0.1;

        pk.abilityLayers = [mainLayer];

        await this.connection.sendDataPacket(pk);
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

    public async sendInventory(): Promise<void> {
        const pk = new InventoryContentPacket();
        pk.items = this.player.getInventory().getItems(true);
        pk.windowId = WindowIds.INVENTORY; // Inventory window
        await this.getConnection().sendDataPacket(pk);
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
            await this.getConnection().sendDataPacket(pk);
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

        await this.getConnection().sendDataPacket(pk);
    }

    /**
     * Sets the item in the player hand.
     *
     * @param item The entity.
     */
    public async sendHandItem(item: ContainerEntry): Promise<void> {
        const pk = new MobEquipmentPacket();
        pk.runtimeEntityId = this.player.getRuntimeId();
        pk.item = item;
        pk.inventorySlot = this.player.getInventory().getHandSlotIndex();
        pk.hotbarSlot = this.player.getInventory().getHandSlotIndex();
        pk.windowId = 0; // Inventory ID
        await this.getConnection().sendDataPacket(pk);
    }

    public async sendForm(form: IForm): Promise<void> {
        const id = this.player.getFormManager().addForm(form);
        const pk = new ModalFormRequestPacket();
        pk.formId = id;
        pk.formData = form.jsonSerialize();
        await this.getConnection().sendDataPacket(pk);
    }

    /**
     * Set the client's current tick.
     *
     * @param tick The tick
     */
    public async sendTime(tick: number): Promise<void> {
        const pk = new SetTimePacket();
        pk.time = tick;
        await this.getConnection().sendDataPacket(pk);
    }

    /**
     * Set the client's gamemode.
     *
     * @param gamemode the numeric gamemode ID
     */
    public async sendGamemode(gamemode: number): Promise<void> {
        const pk = new SetPlayerGameTypePacket();
        pk.gamemode = gamemode;
        await this.getConnection().sendDataPacket(pk);
    }

    public async sendNetworkChunkPublisher(): Promise<void> {
        const pk = new NetworkChunkPublisherUpdatePacket();
        pk.x = Math.floor(this.player.getX());
        pk.y = Math.floor(this.player.getY());
        pk.z = Math.floor(this.player.getZ());
        pk.radius = this.player.viewDistance << 4;
        await this.getConnection().sendDataPacket(pk);
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
                        ?.warn(`Can't find corresponding command class for "${command[0]}"`);
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
                                    new CommandParameter({ paramName: 'value', paramType: CommandParameterType.String })
                                ];
                            if (parameter.constructor.name === 'IntegerArgumentType')
                                return [
                                    new CommandParameter({ paramName: 'number', paramType: CommandParameterType.Int })
                                ];

                            this.server.getLogger()?.warn(`Invalid parameter ${parameter.constructor.name}`);
                            return [
                                new CommandParameter({ paramName: 'value', paramType: CommandParameterType.String })
                            ];
                        })
                        .filter((a) => a)
                        .flat();
                    cmd.overloads[index] = parameters;
                });
                pk.commandData.push(cmd);
            });
        const playerEnum = new CommandEnum();
        playerEnum.enumName = 'Player';
        playerEnum.enumValues = this.player
            .getServer()
            .getSessionManager()
            .getAllPlayers()
            .map((player) => player.getName());
        pk.softEnums = [playerEnum];
        await this.getConnection().sendDataPacket(pk);
    }

    /**
     * Set the client's maximum view distance.
     *
     * @param distance The view distance
     */
    public async setViewDistance(distance: number): Promise<void> {
        this.player.viewDistance = distance;
        const pk = new ChunkRadiusUpdatedPacket();
        pk.radius = distance;
        await this.getConnection().sendDataPacket(pk);
    }

    public async sendAttributes(attributes: Attribute[]): Promise<void> {
        const pk = new UpdateAttributesPacket();
        pk.runtimeEntityId = this.player.getRuntimeId();
        pk.attributes = attributes ?? this.player.getAttributeManager().getAttributes();
        pk.tick = BigInt(0); // TODO
        await this.getConnection().sendDataPacket(pk);
    }

    public async sendMetadata(): Promise<void> {
        const pk = new SetActorDataPacket();
        pk.runtimeEntityId = this.player.getRuntimeId();
        pk.metadata = this.player.getMetadataManager();
        pk.tick = BigInt(0); // TODO
        await this.getConnection().sendDataPacket(pk);
    }

    /**
     * Send a chat message to the client.
     *
     * @remarks
     * Refactor this completely.
     *
     * @param message The message
     * @param xuid The source xuid
     * @param needsTranslation If the TextType requires translation
     * @param type The text type
     */
    public async sendMessage(
        message: string,
        xuid = '',
        parameters: string[] = [],
        needsTranslation = false,
        type = TextType.Raw
    ): Promise<void> {
        if (!message) throw new Error('A message is required');

        const pk = new TextPacket();
        pk.type = type;
        pk.sourceName = '';
        pk.message = message;
        pk.needsTranslation = needsTranslation;
        pk.xuid = xuid;
        pk.platformChatId = ''; // TODO
        pk.parameters = parameters;
        await this.getConnection().sendDataPacket(pk);
    }

    public async sendChunk(chunk: Chunk): Promise<void> {
        const pk = new LevelChunkPacket();
        pk.chunkX = chunk.getX();
        pk.chunkZ = chunk.getZ();
        pk.clientSubChunkRequestsEnabled = false;
        pk.subChunkCount = chunk.getTopEmpty() + 4; // add the useless layers hack
        pk.data = chunk.networkSerialize();
        await this.getConnection().sendDataPacket(pk);

        const hash = CoordinateUtils.encodePos(chunk.getX(), chunk.getZ());
        this.loadedChunks.add(hash);
        this.loadingChunks.delete(hash);
    }

    /**
     * Broadcast the movement to a defined player
     */
    public async broadcastMove(player: Player, mode = MovementType.Normal): Promise<void> {
        const pk = new MovePlayerPacket();
        pk.runtimeEntityId = player.getRuntimeId();

        pk.positionX = player.getX();
        pk.positionY = player.getY();
        pk.positionZ = player.getZ();

        pk.pitch = player.pitch;
        pk.yaw = player.yaw;
        pk.headYaw = player.headYaw;

        pk.mode = mode;

        pk.onGround = player.isOnGround();

        // TODO
        if (mode === MovementType.Teleport) {
            pk.teleportCause = 0;
            pk.teleportItemId = 0;
        }

        pk.ridingEntityRuntimeId = BigInt(0);
        pk.tick = BigInt(0); // TODO
        await this.getConnection().sendDataPacket(pk);
    }

    /**
     * Adds the client to the player list of every player inside
     * the server and also to the player itself.
     */
    public async addToPlayerList(): Promise<void> {
        const playerList = new PlayerListPacket();
        playerList.type = PlayerListAction.TYPE_ADD;

        const entry = new PlayerListEntry({
            uuid: UUID.fromString(this.player.uuid),
            uniqueEntityid: this.player.getRuntimeId(),
            name: this.player.getName(),
            xuid: this.player.xuid,
            platformChatId: '', // TODO: read this value from Login
            buildPlatform: -1,
            skin: this.player.skin!,
            isTeacher: false, // TODO: figure out where to read teacher and host
            isHost: false
        });
        playerList.entries.push(entry);

        await this.server.broadcastPacket(playerList);
        this.server.getSessionManager().getPlayerList().set(this.player.uuid, entry);
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

        this.server.getSessionManager().getPlayerList().delete(this.player.uuid);

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
        await this.getConnection().sendDataPacket(playerList);
    }

    /**
     * Spawn the player for another player
     *
     * @param player the player to send the AddPlayerPacket to
     */
    public async sendSpawn(player: Player): Promise<void> {
        if (!player.getUUID()) {
            this.server.getLogger()?.error(`UUID for player ${player.getName()} is undefined`);
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

        pk.item = this.player.getInventory()?.getItemInHand() ?? new ContainerEntry({ item: new Air(), count: 0 });

        pk.deviceId = this.player.device?.id ?? '';
        pk.metadata = this.player.getMetadataManager();
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
        await this.getConnection().sendDataPacket(pk);
    }

    public async kick(reason = 'unknown reason'): Promise<void> {
        const pk = new DisconnectPacket();
        pk.hideDisconnectionWindow = false;
        pk.message = reason;
        await this.getConnection().sendDataPacket(pk);
    }

    public getConnection(): ClientConnection {
        return this.connection;
    }

    public getPlayer(): Player {
        return this.player;
    }
}
