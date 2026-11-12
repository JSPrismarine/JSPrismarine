import { Chat, ChatType } from '../../chat/Chat';
import { PlayerRespawnState } from '@jsprismarine/minecraft';
import RespawnPacket from '@jsprismarine/protocol/packet/RespawnPacket';

import type { Vector3 } from '@jsprismarine/math';
import { DisconnectReason } from '@jsprismarine/minecraft';
import StartGamePacket from '@jsprismarine/protocol/packet/StartGamePacket';
import type PlayerSession from '../PlayerSession';
import { eyePositionAt } from '../../entity/playerEyes';
import { syncActorPropertyPacket } from '../actorProperties';
import type { Level } from '../../world/Level';
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
import { knownOverworldSpawnOf, overworldSpawnOf, playerSpawnPositionPacket } from '../spawnPosition';
import { allSent } from '../allSent';
import { outsideTick } from '../../world/TickContext';
import type { World } from '../../world/World';
import { createStartGameData } from '../startGameData';
import { sendCachedJoinPacket } from '../joinPacketCache';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

/** The spawn of a world and its level's Overworld spawn, when both are found. */
const knownSpawns = (world: World): { readonly world: Vector3; readonly overworld: Vector3 } | undefined => {
    const spawn = world.getKnownSpawnPosition();
    const overworld = knownOverworldSpawnOf(world);
    return spawn === null || overworld === null ? undefined : { world: spawn, overworld };
};

/**
 * Drives the end of the login exchange, from the client's answer about resource packs to the
 * burst of registries and world state that puts it in a world.
 */
export default class ResourcePackClientResponseHandler implements InputLaneHandler<ResourcePackClientResponsePacket> {
    public static PacketName = 'ResourcePackClientResponsePacket';
    public readonly phases = ['resourcePacks'] as const;
    public readonly lane = 'input';

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
    private static joinRespawns(
        session: Pick<PlayerSession, 'getJoinSpawn'>
    ): Array<[Vector3, PlayerRespawnState, bigint]> {
        const joinSpawn = session.getJoinSpawn();
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
    public handle(packet: ResourcePackClientResponsePacket, context: InputContext): undefined {
        const { session, log, step } = context;
        const { name } = session.identity;
        const response = packet.getPacketData();

        if (response === null) {
            log.debug(`${name} sent an empty resource pack response; dropped`);
            return;
        }

        switch (response.status) {
            case ResourcePackStatus.Refused:
                // The kick queues the goodbye and takes the player off in this input's unit; the
                // step lets the connection close without waiting for it.
                step.output(session.kick('Declined the resource packs', DisconnectReason.RESOURCE_PACK_PROBLEM));
                return;

            case ResourcePackStatus.SendPacks:
                log.debug(
                    `${name} asked for ${response.packIds.length} resource pack(s); the server offers none`,
                    'ResourcePackClientResponseHandler/handle'
                );
                // As for a refusal.
                step.output(
                    session.kick(
                        'Asked for resource packs this server does not have',
                        DisconnectReason.RESOURCE_PACK_PROBLEM
                    )
                );
                return;

            case ResourcePackStatus.HaveAllPacks: {
                if (this.joined.has(session)) {
                    log.debug(
                        `${name} said it had all packs after its join started; dropped`,
                        'ResourcePackClientResponseHandler/handle'
                    );
                    return;
                }

                step.output(
                    session.getConnection().sendDataPacket(
                        new ResourcePackStackPacket({
                            texturePackRequired: false,
                            texturePacks: [],
                            gameVersion: '*',
                            experiments: [],
                            experimentsAlreadyEnabled: false,
                            includeEditorPacks: false
                        })
                    )
                );
                return;
            }

            case ResourcePackStatus.Completed:
                if (this.joined.has(session)) {
                    log.debug(
                        `${name} completed the resource packs twice; the second was dropped`,
                        'ResourcePackClientResponseHandler/handle'
                    );
                    return;
                }

                this.joined.add(session);

                // Before the burst goes out: the client answers `StartGame` with play-phase
                // packets - `RequestChunkRadius` first - while the burst is still being sent.
                session.getConnection().phase = 'play';

                this.startJoin(context);
                return;

            default:
                log.debug(
                    `Dropped a resource pack response with unknown status ${response.status} from ${name}`,
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
     * - A second round of settings and inventory. `PlayerSession.completeSpawn` runs once, from
     *   `SetLocalPlayerAsInitializedHandler`, because the client rebuilds its local player while
     *   spawning and throws away what step 6 told it.
     */
    private startJoin(context: InputContext): void {
        const { session, log, services, step } = context;
        const { identity } = session;
        const address = session.getConnection().getAddress();
        log.info(
            `§b${identity.name}§f is attempting to join with id §b${identity.uuid}§f (§b${session.runtimeId}§f) from ${address.getAddress()}:${address.getPort()}`
        );

        const spawnEvent = new PlayerSpawnEvent(session);
        services.events.post('playerSpawn', spawnEvent);
        if (spawnEvent.isCanceled()) return;

        // The burst reads the spawn of the world the player joins and the level's Overworld
        // spawn, which placing a new player found before this. A world that has not found its
        // own yet, such as a Nether a returning player comes back to, searches outside the tick,
        // and the burst is then a message to that world, applied at the input step after it.
        const world = session.getWorld();
        const spawns = knownSpawns(world);
        if (spawns !== undefined) {
            step.output(this.sendJoinBurst(context, spawns));
            return;
        }
        outsideTick(() =>
            Promise.all([world.getSpawnPosition(), overworldSpawnOf(world)]).then(
                () =>
                    services.messages.send(world, () => {
                        const found = knownSpawns(world);
                        if (found === undefined) throw new Error(`${world.getName()} lost its spawn before the join`);
                        session.released(this.sendJoinBurst(context, found));
                    }),
                (error: unknown) => log.error(error)
            )
        );
    }

    /**
     * The packets of {@link startJoin}, in order, once the `playerSpawn` event let the join go on.
     * Every packet is queued before this returns.
     *
     * @param spawns - The spawn of the player's world and the level's Overworld spawn.
     * @returns Settles once the transport has framed the packets.
     */
    private sendJoinBurst(
        { session, log, config, services, step }: InputContext,
        spawns: { readonly world: Vector3; readonly overworld: Vector3 }
    ): Promise<void> {
        const { identity } = session;
        const connection = session.getConnection();
        const world = session.getWorld();
        const content = services.content;
        const recipeLimit = config.getCraftingRecipeLimit();
        const compressionLevel = config.getPacketCompressionLevel();

        // Built at startup and cached, so this is a lookup. Undefined only when the
        // build could not produce payloads, and each packet below then writes what it
        // wrote before the content build existed. Built against this session's own item
        // numbering: the registry, the creative entries and the brewing recipes all carry
        // item numbers, and the numbering is a property of the negotiated protocol.
        const payloads = joinContentPayloads(content, log, {
            itemData: connection.codec.itemData
        });

        const sends = [
            sendCachedJoinPacket(connection, content, recipeLimit, compressionLevel, new JigsawStructureDataPacket())
        ];

        const worldSpawnPos = spawns.world;
        sends.push(
            connection.sendDataPacket(
                new StartGamePacket(
                    createStartGameData({
                        config,
                        tick: step.tick,
                        player: session,
                        world,
                        worldSpawnPosition: worldSpawnPos,
                        serverVersion: connection.codec.minecraftVersions.at(-1) ?? '',
                        blockProperties: payloads?.blockProperties
                    })
                )
            )
        );

        const dimensionData = ResourcePackClientResponseHandler.customDimensionData(world.getLevel());
        if (dimensionData !== undefined) sends.push(connection.sendDataPacket(dimensionData));

        // Every item the content build resolved, with the numbers the
        // captured table gives them. Without it a pack's own item has no row
        // the client could resolve it through.
        const itemRegistry =
            payloads === undefined ? new ItemRegistryPacket() : new ItemRegistryPacket({ items: [...payloads.items] });
        sends.push(sendCachedJoinPacket(connection, content, recipeLimit, compressionLevel, itemRegistry));

        // Register each type's render-facing properties before any actor of that type spawns.
        for (const type of content.entities.registry.values()) {
            const propertyPacket = syncActorPropertyPacket(type.identifier, type.entity.description.properties);
            if (propertyPacket !== undefined) {
                sends.push(
                    sendCachedJoinPacket(
                        connection,
                        content,
                        recipeLimit,
                        compressionLevel,
                        propertyPacket,
                        type.identifier
                    )
                );
            }
        }

        sends.push(
            sendCachedJoinPacket(
                connection,
                content,
                recipeLimit,
                compressionLevel,
                new AvailableActorIdentifiersPacket()
            )
        );
        sends.push(
            sendCachedJoinPacket(connection, content, recipeLimit, compressionLevel, new BiomeDefinitionListPacket())
        );
        sends.push(
            sendCachedJoinPacket(
                connection,
                content,
                recipeLimit,
                compressionLevel,
                new FeatureRegistryPacket({ features: [] })
            )
        );
        sends.push(session.sendCreativeContents());
        sends.push(session.sendCraftingData());
        sends.push(session.sendAvailableCommands());

        sends.push(session.addToPlayerList());
        sends.push(session.sendPlayerList());

        sends.push(session.sendTime(world.getTicks()));

        sends.push(connection.sendDataPacket(playerSpawnPositionPacket(session.getPlayer(), world, spawns.overworld)));

        sends.push(session.announceSettings());
        sends.push(session.sendAttributes());
        sends.push(session.sendMetadata());

        sends.push(session.sendInventory());

        // A packet object encodes once and keeps its bytes, so each of these is its own.
        for (const [position, state, runtimeEntityId] of ResourcePackClientResponseHandler.joinRespawns(session)) {
            const respawn = new RespawnPacket({
                position: { x: position.getX(), y: position.getY(), z: position.getZ() },
                state,
                runtimeEntityId
            });
            sends.push(connection.sendDataPacket(respawn));
        }

        sends.push(
            services.chat.send(
                new Chat({
                    sender: services.console,
                    // The bare translation key: a color code in front of the `%` stops the
                    // client resolving it, and it renders the unresolved string instead.
                    message: `%multiplayer.player.joined`,
                    parameters: [identity.name],
                    needsTranslation: true,
                    type: ChatType.TRANSLATION
                })
            )
        );
        return allSent(sends);
    }
}
