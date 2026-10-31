import { Chat, ChatType } from '../../chat/Chat';
import { PlayerRespawnState } from '@jsprismarine/minecraft';
import RespawnPacket from '@jsprismarine/protocol/packet/RespawnPacket';

import type { Vector3 } from '@jsprismarine/math';
import { DisconnectReason } from '@jsprismarine/minecraft';
import StartGamePacket from '@jsprismarine/protocol/packet/StartGamePacket';
import type { Player, PlayerSession } from '../../';
import { eyePositionAt } from '../../entity/Human';
import { syncActorPropertyPacket } from '../actorProperties';
import type Server from '../../Server';
import type { Level } from '../../world/Level';
import ChatEvent from '../../events/chat/ChatEvent';
import PlayerSpawnEvent from '../../events/player/PlayerSpawnEvent';
import AvailableActorIdentifiersPacket from '@jsprismarine/protocol/packet/AvailableActorIdentifiersPacket';
import BiomeDefinitionListPacket from '@jsprismarine/protocol/packet/BiomeDefinitionListPacket';
import DimensionDataPacket from '@jsprismarine/protocol/packet/DimensionDataPacket';
import DimensionDefinition from '@jsprismarine/protocol/structure/DimensionDefinition';
import FeatureRegistryPacket from '@jsprismarine/protocol/packet/FeatureRegistryPacket';
import ItemRegistryPacket from '@jsprismarine/protocol/packet/ItemRegistryPacket';
import JigsawStructureDataPacket from '@jsprismarine/protocol/packet/JigsawStructureDataPacket';
import type ResourcePackClientResponsePacket from '@jsprismarine/protocol/packet/ResourcePackClientResponsePacket';
import ResourcePackStackPacket from '@jsprismarine/protocol/packet/ResourcePackStackPacket';
import { ResourcePackStatus } from '@jsprismarine/protocol';
import { joinContentPayloads } from '../contentPayloads';
import { overworldSpawnOf, playerSpawnPositionPacket } from '../spawnPosition';
import { createStartGameData } from '../startGameData';
import type PacketHandler from './PacketHandler';

/**
 * Drives the end of the login exchange, from the client's answer about resource packs to the
 * burst of registries and world state that puts it in a world.
 */
export default class ResourcePackClientResponseHandler implements PacketHandler<ResourcePackClientResponsePacket> {
    public static PacketName = 'ResourcePackClientResponsePacket';
    public readonly phases = ['resourcePacks'] as const;

    /**
     * The `Respawn` packets that end a join, as `[position, state, runtime id]`.
     *
     * For a player placed at the spawn, the three a Bedrock Dedicated Server sends: searching
     * at the requested spot's eyes, searching at its feet, then ready at the final spot's eyes,
     * all with runtime id 0. BDS sends the ready one about a third of a second later, once its
     * search is done and before the client has asked for a chunk radius; this server has
     * finished placing the player already.
     *
     * None for a player returning to a saved position. What BDS sends then has not been
     * measured, and this server sent none before.
     */
    private static joinRespawns(player: Player): Array<[Vector3, PlayerRespawnState, bigint]> {
        const joinSpawn = player.getJoinSpawn();
        if (joinSpawn === null) return [];

        return [
            [eyePositionAt(joinSpawn.requested), PlayerRespawnState.SEARCHING_FOR_SPAWN, 0n],
            [joinSpawn.requested, PlayerRespawnState.SEARCHING_FOR_SPAWN, 0n],
            [eyePositionAt(joinSpawn.position), PlayerRespawnState.READY_TO_SPAWN, 0n]
        ];
    }

    /**
     * The `DimensionData` that tells the client about the level's custom dimension types, or
     * undefined for a level of vanilla dimensions, which the client knows without it.
     *
     * One entry per custom type, keyed by the type's name, with the bounds and the id from
     * 1000 up that the level chose. The cloud fields go on the wire only when the connection
     * encodes the packet at protocol 2225 or later; the definition carries them either way.
     * Sent before the chunks so the client has the bounds when the first `LevelChunk` with
     * that dimension id arrives. Whether a client accepts an id of 1000 or more has not been
     * checked against a real client.
     */
    private static customDimensionData(level: Level): DimensionDataPacket | undefined {
        const definitions = level.customDimensionDefinitions();
        if (definitions.length === 0) return undefined;

        const types = [...level.getDimensionTypes().values()];
        return new DimensionDataPacket({
            definitions: definitions.map((fields) => {
                const type = types.find((candidate) => candidate.bedrockId === fields.dimensionType);
                if (type === undefined) {
                    throw new Error(
                        `Level ${level.getName()} announces dimension ${fields.dimensionType} without a type`
                    );
                }

                return {
                    id: type.name,
                    definition: new DimensionDefinition(
                        fields.minimumY,
                        fields.heightRange,
                        fields.generatorType,
                        fields.dimensionType,
                        fields.packId,
                        fields.defaultBiome,
                        fields.cloudHeight,
                        fields.renderClouds
                    )
                };
            })
        });
    }

    /**
     * Sessions whose join has started, so a repeated `Completed` cannot start it again.
     *
     * Kept here rather than on the session because this handler is the only reader. A
     * `WeakSet` entry goes away with the session, so nothing has to clear it on disconnect.
     */
    private readonly joined = new WeakSet<PlayerSession>();

    /**
     * Answers each status and drops anything else.
     *
     * `HaveAllPacks` gets the pack stack and `Completed` starts the join, each at most once
     * per session. A client that repeats either after its join started is logged and ignored:
     * a second burst would announce the player to everyone again and fire a second
     * `playerSpawn`. `Completed` is accepted without a `HaveAllPacks` before it, since the
     * client is the one that knows whether it has the stack.
     *
     * `Refused` is the player declining the packs and `SendPacks` asks the server to send the
     * ones in `Downloading Packs`. The server offers no packs, so neither can come from a
     * client that read `ResourcePacksInfoPacket`. Both end the connection with a resource pack
     * reason, which is what a vanilla server does for a refusal, instead of leaving the client
     * on the loading screen until RakNet times it out. Once the server serves packs, `SendPacks`
     * has to answer with one `ResourcePackDataInfoPacket` per requested id instead.
     *
     * A status outside the four, which `decodePayload` never produces but a caller can set, is
     * logged at debug level and dropped.
     */
    public async handle(
        packet: ResourcePackClientResponsePacket,
        server: Server,
        session: PlayerSession
    ): Promise<void> {
        const player = session.getPlayer();
        const logger = server.getLogger();
        const response = packet.getPacketData();

        if (response === null) {
            logger.debug(`${player.getName()} sent an empty resource pack response; dropped`);
            return;
        }

        switch (response.status) {
            case ResourcePackStatus.Refused:
                await player.kick('Declined the resource packs', DisconnectReason.RESOURCE_PACK_PROBLEM);
                return;

            case ResourcePackStatus.SendPacks:
                logger.debug(
                    `${player.getName()} asked for ${response.packIds.length} resource pack(s); the server offers none`,
                    'ResourcePackClientResponseHandler/handle'
                );
                await player.kick(
                    'Asked for resource packs this server does not have',
                    DisconnectReason.RESOURCE_PACK_PROBLEM
                );
                return;

            case ResourcePackStatus.HaveAllPacks: {
                if (this.joined.has(session)) {
                    logger.debug(
                        `${player.getName()} said it had all packs after its join started; dropped`,
                        'ResourcePackClientResponseHandler/handle'
                    );
                    return;
                }

                await session.getConnection().sendDataPacket(
                    new ResourcePackStackPacket({
                        texturePackRequired: false,
                        texturePacks: [],
                        gameVersion: '*',
                        experiments: [],
                        experimentsAlreadyEnabled: false,
                        includeEditorPacks: false
                    })
                );
                return;
            }

            case ResourcePackStatus.Completed:
                if (this.joined.has(session)) {
                    logger.debug(
                        `${player.getName()} completed the resource packs twice; the second was dropped`,
                        'ResourcePackClientResponseHandler/handle'
                    );
                    return;
                }

                this.joined.add(session);

                // Before the burst goes out: the client answers `StartGame` with play-phase
                // packets - `RequestChunkRadius` first - while the burst is still being sent.
                session.getConnection().phase = 'play';

                await this.sendJoinBurst(server, session);
                return;

            default:
                logger.debug(
                    `Dropped a resource pack response with unknown status ${response.status} from ${player.getName()}`,
                    'ResourcePackClientResponseHandler/handle'
                );
        }
    }

    /**
     * Everything a client is sent between agreeing on resource packs and asking for a chunk
     * radius, in the order a Bedrock Dedicated Server sends it. Protocol 2193.
     *
     * 1. `JigsawStructureData`. The one exception to "StartGame first": a client that reaches
     *    StartGame without the jigsaw rules disconnects with `MissingStructureData`.
     * 2. `StartGame`. Nothing game-related may precede it. A client still in its login state
     *    treats game packets as malformed and drops with `InitialConnection-90`. Then
     *    `DimensionData`, only for a level with a dimension type the client has no built-in
     *    dimension for: see {@link customDimensionData}.
     * 3. `ItemRegistry` (our `ItemRegistryPacket`), `AvailableActorIdentifiers`,
     *    `BiomeDefinitionList`, `FeatureRegistry`, `CreativeContent`, `CraftingData`,
     *    `AvailableCommands`. The registries the client builds its world from; it needs them
     *    before anything that references an item, an actor type or a biome. The feature
     *    registry is empty, as a dedicated server's is for a world with no custom features.
     * 4. `PlayerList`. Added to everyone's list and sent the whole list. The client keys the
     *    list on uuids it only has after StartGame.
     * 5. `SetTime`, `SetSpawnPosition`. World state, once there is a world to apply it to. The
     *    spawn is the player's own point when they have one, in that point's dimension, so a
     *    bed in another dimension shows where it is.
     * 6. `SetPlayerGameType`, `UpdateAdventureSettings`, `UpdateAbilities`, `UpdateAttributes`,
     *    `SetActorData`. The local player, which the client creates when it handles StartGame.
     * 7. `InventoryContent`. Needs the item registry from step 3 and a player from step 6.
     * 8. `Respawn`, three of them, for a player placed at the spawn: see {@link joinRespawns}.
     *    BDS 1.26.52 sends them right after `AvailableCommands`, at the end of its own burst.
     * 9. The join message, as the last thing so it lands on a client that can show it.
     *
     * Not sent here, on purpose:
     * - `ClientReadyToSpawn`. This used to send it, and only a client sends that state.
     * - `LevelChunk` and `PlayStatus(PlayerSpawn)`. The client discards terrain that arrives
     *   before it has asked for a radius and been answered - see `PlayerSession.setViewDistance`.
     * - The entity spawns. They follow PlayerSpawn, from `announceSpawnIfReady`.
     * - A second round of settings and inventory. `Player.completeSpawn` runs once, from
     *   `SetLocalPlayerAsInitializedHandler`, because the client rebuilds its local player while
     *   spawning and throws away what step 6 told it.
     */
    private async sendJoinBurst(server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        server
            .getLogger()
            .info(
                `§b${player.getName()}§f is attempting to join with id §b${player.getUUID()}§f (§b${player.getRuntimeId()}§f) from ${player
                    .getAddress()
                    .getAddress()}:${player.getAddress().getPort()}`
            );

        const spawnEvent = new PlayerSpawnEvent(player);
        server.post(['playerSpawn', spawnEvent]);
        if (spawnEvent.isCanceled()) return;

        const world = player.getWorld();
        const connection = session.getConnection();

        // Built at startup and cached, so this is a lookup. Undefined only when the
        // build could not produce payloads, and each packet below then writes what it
        // wrote before the content build existed. Built against this session's own item
        // numbering: the registry, the creative entries and the brewing recipes all carry
        // item numbers, and the numbering is a property of the negotiated protocol.
        const payloads = joinContentPayloads(server.getContent(), server.getLogger(), {
            itemData: connection.codec.itemData
        });

        await connection.sendDataPacket(new JigsawStructureDataPacket());

        const worldSpawnPos = await world.getSpawnPosition();
        await connection.sendDataPacket(
            new StartGamePacket(
                createStartGameData({
                    server,
                    player,
                    world,
                    worldSpawnPosition: worldSpawnPos,
                    serverVersion: connection.codec.minecraftVersions.at(-1) ?? '',
                    blockProperties: payloads?.blockProperties
                })
            )
        );

        const dimensionData = ResourcePackClientResponseHandler.customDimensionData(world.getLevel());
        if (dimensionData !== undefined) await connection.sendDataPacket(dimensionData);

        // Every item the content build resolved, with the numbers the
        // captured table gives them. Without it a pack's own item has no row
        // the client could resolve it through.
        const itemRegistry =
            payloads === undefined ? new ItemRegistryPacket() : new ItemRegistryPacket({ items: [...payloads.items] });
        await connection.sendDataPacket(itemRegistry);

        // Register each type's render-facing properties before any actor of that type spawns.
        for (const type of server.getContent().entities.registry.values()) {
            const propertyPacket = syncActorPropertyPacket(type.identifier, type.entity.description.properties);
            if (propertyPacket !== undefined) await connection.sendDataPacket(propertyPacket);
        }

        await connection.sendDataPacket(new AvailableActorIdentifiersPacket());
        await connection.sendDataPacket(new BiomeDefinitionListPacket());
        await connection.sendDataPacket(new FeatureRegistryPacket({ features: [] }));
        await session.sendCreativeContents();
        await session.sendCraftingData();
        await session.sendAvailableCommands();

        await session.addToPlayerList();
        await session.sendPlayerList();

        await session.sendTime(world.getTicks());

        await connection.sendDataPacket(playerSpawnPositionPacket(player, world, await overworldSpawnOf(world)));

        await player.sendSettings();
        await session.sendAttributes();
        await session.sendMetadata();

        await session.sendInventory();

        // A packet object encodes once and keeps its bytes, so each of these is its own.
        for (const [position, state, runtimeEntityId] of ResourcePackClientResponseHandler.joinRespawns(player)) {
            const respawn = new RespawnPacket({
                position: { x: position.getX(), y: position.getY(), z: position.getZ() },
                state,
                runtimeEntityId
            });
            await connection.sendDataPacket(respawn);
        }

        const chatSpawnEvent = new ChatEvent(
            new Chat({
                sender: server.getConsoleSender(),
                // The bare translation key: a color code in front of the `%` stops the
                // client resolving it, and it renders the unresolved string instead.
                message: `%multiplayer.player.joined`,
                parameters: [player.getName()],
                needsTranslation: true,
                type: ChatType.TRANSLATION
            })
        );
        await server.emit('chat', chatSpawnEvent);
    }
}
