import type { Attribute } from '../entity/Attribute';
import BlockPosition from '../world/BlockPosition';
import Chunk from '../world/chunk/Chunk';
import type ClientConnection from './ClientConnection';
import CoordinateUtils from '../world/CoordinateUtils';
import Heap from 'heap';
import type IForm from '../form/IForm';
import type Item from '../item/Item';
import type Player from '../Player';
import type Server from '../Server';
import { UUID } from '../utils/UUID';
import {
    CommandPermissionLevel,
    Dimension,
    DisconnectReason,
    PlayerPermissionLevel,
    PlayerPositionMode
} from '@jsprismarine/minecraft';
import {
    AddActorPacket,
    AddPlayerPacket,
    DisconnectPacket,
    MessageType,
    MovePlayerPacket,
    PlayStatusPacket,
    PropertySyncData,
    SerializedAbilitiesData,
    SetTimePacket,
    Vec3,
    PlayStatus,
    LevelChunkPacket,
    NetworkChunkPublisherUpdatePacket,
    ChunkPos,
    ChunkRadiusUpdatedPacket,
    TextPacket
} from '@jsprismarine/protocol';
import type { Entity } from '../';

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
            for (const chunk of chunksToSend) {
                this.connection.sendNetworkPacket(
                    new LevelChunkPacket({
                        chunkPosition: new ChunkPos(chunk.getX(), chunk.getZ()),
                        dimensionId: Dimension.OVERWORLD,
                        subChunksRequested: false,
                        cacheEnabled: false,
                        serializedChunk: chunk.networkSerialize(),
                        subChunkCount: chunk.getTopEmpty() + 4 // TODO: remove this hack (properly implement it)
                    })
                );

                const hash = Chunk.packXZ(chunk.getX(), chunk.getZ());
                this.loadedChunks.add(hash);
                this.loadingChunks.delete(hash);
            }
        }

        this.player.viewDistance && (await this.needNewChunks());
    }

    /**
     * Shows/spawns an entity to the player.
     * @param entity - The entity to be shown.
     * @param velocity - The velocity/motion of the entity (optional).
     */
    public showEntity(entity: Entity, velocity?: Vec3): void {
        this.connection.sendNetworkPacket(
            new AddActorPacket({
                targetActorUniqueId: entity.getRuntimeId(),
                targetActorRuntimeId: entity.getRuntimeId(),
                actorType: entity.constructor.prototype.MOB_ID,
                position: entity,
                velocity: velocity ?? new Vec3(0, 0, 0),
                actorLinks: [], // TODO: get from entity
                attributes: [], // TODO: get from entity
                headYaw: entity.headYaw,
                bodyYaw: entity.bodyYaw,
                metadata: [], // TODO: get from entity
                rotation: entity,
                synchedProperties: new PropertySyncData([], [])
            })
        );
    }

    /**
     * Notify a client about change(s) to the adventure settings.
     *
     * @param player - The client-controlled entity
     */
    public async sendSettings(player?: Player): Promise<void> {
        /* const target = player ?? this.player;

        const pk = new UpdateAdventureSettingsPacket();
        pk.worldImmutable = target.gamemode === Gamemode.Gametype.SPECTATOR;
        pk.noAttackingPlayers = target.gamemode === Gamemode.Gametype.SPECTATOR;
        pk.noAttackingMobs = target.gamemode === Gamemode.Gametype.SPECTATOR;
        pk.autoJump = true; // TODO: grab this info elsewhere
        pk.showNameTags = true; // TODO: player may be able to hide them

        await this.connection.sendDataPacket(pk); */
    }

    public async sendAbilities(player?: Player): Promise<void> {
        /* const target = player ?? this.player;

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
            [AbilityLayerFlag.NO_CLIP, target.gamemode === Gamemode.Gametype.SPECTATOR],
            [AbilityLayerFlag.OPERATOR_COMMANDS, target.isOp()],
            [AbilityLayerFlag.TELEPORT, target.isOp()],
            [AbilityLayerFlag.INVULNERABLE, target.gamemode === Gamemode.Gametype.CREATIVE],
            [AbilityLayerFlag.MUTED, false],
            [AbilityLayerFlag.WORLD_BUILDER, false],
            [AbilityLayerFlag.INSTABUILD, target.gamemode === Gamemode.Gametype.CREATIVE],
            [AbilityLayerFlag.LIGHTNING, false],
            [AbilityLayerFlag.BUILD, target.gamemode !== Gamemode.Gametype.SPECTATOR],
            [AbilityLayerFlag.MINE, target.gamemode !== Gamemode.Gametype.SPECTATOR],
            [AbilityLayerFlag.DOORS_AND_SWITCHES, target.gamemode !== Gamemode.Gametype.SPECTATOR],
            [AbilityLayerFlag.OPEN_CONTAINERS, target.gamemode !== Gamemode.Gametype.SPECTATOR],
            [AbilityLayerFlag.ATTACK_PLAYERS, target.gamemode !== Gamemode.Gametype.SPECTATOR],
            [AbilityLayerFlag.ATTACK_MOBS, target.gamemode !== Gamemode.Gametype.SPECTATOR]
        ]);
        mainLayer.flySpeed = 0.05;
        mainLayer.walkSpeed = 0.1;

        pk.abilityLayers = [mainLayer];

        await this.connection.sendDataPacket(pk); */
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
                    this.sendChunk(loadedChunk);
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
            this.sendNetworkChunkPublisher(dist ?? viewDistance, []);
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

    public async sendInventory(): Promise<void> {
        /* const pk = new InventoryContentPacket();
        pk.items = this.player.getInventory().getItems(true);
        pk.windowId = WindowIds.INVENTORY; // Inventory window
        await this.connection.sendDataPacket(pk);
        await this.sendHandItem(this.player.getInventory().getItemInHand()); */
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
        /* const pk = new CreativeContentPacket();
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

        await this.connection.sendDataPacket(pk); */
    }

    /**
     * Sets the item in the player hand.
     *
     * @param item - The entity.
     */
    public async sendHandItem(item: Item): Promise<void> {
        /* const pk = new MobEquipmentPacket();
        pk.runtimeEntityId = this.player.getRuntimeId();
        pk.item = item;
        pk.inventorySlot = this.player.getInventory().getHandSlotIndex();
        pk.hotbarSlot = this.player.getInventory().getHandSlotIndex();
        pk.windowId = 0; // Inventory ID
        await this.connection.sendDataPacket(pk); */
    }

    public async sendForm(form: IForm): Promise<void> {
        /* const id = this.player.getFormManager().addForm(form);
        const pk = new ModalFormRequestPacket();
        pk.formId = id;
        pk.formData = form.jsonSerialize();
        await this.connection.sendDataPacket(pk); */
    }

    /**
     * Set the client's current tick.
     *
     * @param tick - The tick
     */
    public sendTime(tick: number): void {
        this.connection.sendNetworkPacket(new SetTimePacket({ time: tick }));
    }

    /**
     * Set the client's gamemode.
     *
     * @param gamemode - the numeric gamemode ID
     */
    public sendGamemode(gamemode: number): void {
        /* const pk = new SetPlayerGameTypePacket();
        pk.gamemode = gamemode;
        await this.connection.sendDataPacket(pk); */
    }

    public sendNetworkChunkPublisher(distance: number, savedChunks: ChunkPos[]): void {
        this.connection.sendNetworkPacket(
            new NetworkChunkPublisherUpdatePacket({
                newViewPosition: BlockPosition.fromVector3(this.player),
                newViewRadius: distance << 4,
                serverBuilChunksList: savedChunks
            })
        );
    }

    public sendAvailableCommands(): void {
        /* const pk = new AvailableCommandsPacket();

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
                            const parameters = parameter.getParameters();
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

                            this.server.getLogger()?.warn(`Invalid parameter ${parameter.constructor.name}`);
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
        const playerEnum = new CommandEnum();
        playerEnum.enumName = 'Player';
        playerEnum.enumValues = this.player
            .getServer()
            .getPlayerManager()
            .getAllPlayers()
            .map((player) => player.getName());
        pk.softEnums = [playerEnum];
        // TODO: update commands
        // await this.getConnection().sendDataPacket(pk); */
    }

    /**
     * Sets the clientside view distance.
     *
     * @param distance - The view distance
     */
    public setViewDistance(distance: number): void {
        this.player.viewDistance = distance;
        this.connection.sendNetworkPacket(
            new ChunkRadiusUpdatedPacket({
                chunkRadius: distance
            })
        );
    }

    public sendAttributes(attributes: Attribute[]): void {
        /* const pk = new UpdateAttributesPacket();
        pk.runtimeEntityId = this.player.getRuntimeId();
        pk.attributes = attributes.length > 0 ? attributes : this.player.getAttributeManager().getAttributes();
        pk.tick = BigInt(0); // TODO
        await this.connection.sendDataPacket(pk); */
    }

    public sendMetadata(): void {
        /* const pk = new SetActorDataPacket();
        pk.runtimeEntityId = this.player.getRuntimeId();
        pk.metadata = this.player.getMetadataManager();
        pk.tick = BigInt(0); // TODO
        await this.connection.sendDataPacket(pk); */
    }

    /**
     * Send a chat message to the client.
     *
     * @remarks
     * Refactor this completely.
     *
     * @param message - The message
     * @param xuid - The source xuid
     * @param parameters -
     * @param needsTranslation - If the TextType requires translation
     * @param type - The text type
     */
    public sendMessage(
        message: string,
        xuid = '',
        parameters: string[] = [],
        needsTranslation = false,
        type = MessageType.RAW | MessageType.ANNOUNCEMENT
    ) {
        if (!message) throw new Error('A message is required');
        this.connection.sendNetworkPacket(
            new TextPacket({
                message,
                messageType: type,
                localize: needsTranslation,
                senderXUID: xuid,
                platformId: '',
                parameterList: parameters,
                playerName: ''
            })
        );
    }

    public async sendToast(title: string, body: string): Promise<void> {
        /* if (!title) throw new Error('A toast title is required');
        if (!body) throw new Error('A toast body is required.');

        const pk = new ToastRequestPacket();
        pk.title = title;
        pk.body = body;

        await this.connection.sendDataPacket(pk); */
    }

    public sendChunk(chunk: Chunk): void {
        this.connection.sendNetworkPacket(
            new LevelChunkPacket({
                chunkPosition: new ChunkPos(chunk.getX(), chunk.getZ()),
                dimensionId: Dimension.OVERWORLD,
                subChunksRequested: false,
                cacheEnabled: false,
                serializedChunk: chunk.networkSerialize(),
                subChunkCount: chunk.getTopEmpty() + 4 // add the useless layers hack
            })
        );

        const hash = Chunk.packXZ(chunk.getX(), chunk.getZ());
        this.loadedChunks.add(hash);
        this.loadingChunks.delete(hash);
    }

    /**
     * Broadcast the movement to a defined player
     */
    public broadcastMove(player: Player, mode = PlayerPositionMode.NORMAL): void {
        this.connection.sendNetworkPacket(
            new MovePlayerPacket({
                actorRuntimeId: player.getRuntimeId(),
                position: player,
                rotation: player.rotation,
                headYaw: player.headYaw,
                positionMode: mode,
                onGround: player.isOnGround(),
                ridingRuntimeId: 0n,
                tick: 0n,
                teleportationCause: 0,
                sourceActorType: 0
            })
        );
    }

    /**
     * Adds the client to the player list of every player inside
     * the server and also to the player itself.
     */
    public async addToPlayerList(): Promise<void> {
        /* const playerList = new PlayerListPacket();
        playerList.type = PlayerListAction.TYPE_ADD;

        const entry = new PlayerListEntry({
            uuid: UUID.fromString(this.player.uuid),
            uniqueEntityid: this.player.getRuntimeId(),
            name: this.player.getName(),
            xuid: this.player.xuid,
            platformChatId: '', // TODO: read this value from Login
            buildPlatform: this.player.device ? this.player.device.os : -1,
            skin: this.player.skin!,
            isTeacher: false, // TODO: figure out where to read teacher and host
            isHost: false
        });
        playerList.entries.push(entry);

        await this.server.broadcastPacket(playerList);
        this.server.getPlayerManager().getPlayerList().set(this.player.uuid, entry); */
    }

    /**
     * Removes a player from other players list
     */
    public async removeFromPlayerList(): Promise<void> {
        /* if (!this.player.uuid) return;

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
        ); */
    }

    /**
     * Sends the full player list to the player.
     */
    public sendPlayerList(): void {
        // const playerList = new PlayerListPacket();
        // playerList.type = PlayerListAction.TYPE_ADD;
        // playerList.entries = Array.from(this.server.getSessionManager().getPlayerList().values());
        // await this.connection.sendDataPacket(playerList);
    }

    /**
     * Spawn the player for another player
     *
     * @param player - the player to send the AddPlayerPacket to
     */
    public async sendSpawn(player: Player): Promise<void> {
        player
            .getNetworkSession()
            .getConnection()
            .sendNetworkPacket(
                new AddPlayerPacket({
                    uuid: UUID.fromString(this.player.getUUID()),
                    playerName: this.player.getName(),
                    targetRuntimeId: this.player.getRuntimeId(),
                    position: this.player,
                    carriedItem: this.player.getInventory().getItemInHand(),
                    gamemode: this.player.gamemode,
                    metadata: [], // TODO: metadata
                    propertySyncData: new PropertySyncData([], []),
                    abilitiesData: new SerializedAbilitiesData(
                        this.player.getRuntimeId(),
                        PlayerPermissionLevel.MEMBER,
                        CommandPermissionLevel.OWNER,
                        []
                    ),
                    platformChatId: '', // TODO: read this value from Login
                    velocity: new Vec3(0, 0, 0),
                    rotation: this.player.rotation,
                    headYaw: this.player.headYaw,
                    actorLinks: [], // TODO: actor links
                    deviceId: this.player.device?.id ?? '',
                    buildPlatform: this.player.device ? this.player.device.os : -1
                })
            );
    }

    /**
     * Despawn the player entity from another player
     */
    public async sendDespawn(player: Player): Promise<void> {
        // const pk = new RemoveActorPacket();
        // pk.uniqueEntityId = this.player.getRuntimeId(); // We use runtime as unique
        // player.getNetworkSession().getConnection().sendNetworkPacket(pk);
    }

    public sendPlayStatus(status: PlayStatus): void {
        this.connection.sendNetworkPacket(new PlayStatusPacket({ status }));
    }

    public kick(reason = 'unknown reason'): void {
        this.connection.sendNetworkPacket(
            new DisconnectPacket({ reason: DisconnectReason.DISCONNECTED, skipMessage: false, message: reason })
        );
    }

    public getConnection(): ClientConnection {
        return this.connection;
    }

    public getPlayer(): Player {
        return this.player;
    }
}
