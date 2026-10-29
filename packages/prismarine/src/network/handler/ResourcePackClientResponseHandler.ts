import { Chat, ChatType } from '../../chat/Chat';
import { PlayerRespawnState } from '@jsprismarine/minecraft';
import RespawnPacket from '../packet/RespawnPacket';
import SetSpawnPositionPacket, { SpawnPositionType } from '../packet/SetSpawnPositionPacket';

import type { Vector3 } from '@jsprismarine/math';
import { DisconnectReason, Generator, getGametypeId } from '@jsprismarine/minecraft';
import type { Player, PlayerSession } from '../../';
import { eyePositionAt } from '../../entity/Human';
import { syncActorPropertyPacket } from '../actorProperties';
import type Server from '../../Server';
import ChatEvent from '../../events/chat/ChatEvent';
import PlayerSpawnEvent from '../../events/player/PlayerSpawnEvent';
import BlockPosition from '../../world/BlockPosition';
import Flat from '../../world/generators/Flat';
import AvailableActorIdentifiersPacket from '../packet/AvailableActorIdentifiersPacket';
import BiomeDefinitionListPacket from '../packet/BiomeDefinitionListPacket';
import FeatureRegistryPacket from '../packet/FeatureRegistryPacket';
import ItemRegistryPacket from '../packet/ItemRegistryPacket';
import JigsawStructureDataPacket from '../packet/JigsawStructureDataPacket';
import type ResourcePackClientResponsePacket from '../packet/ResourcePackClientResponsePacket';
import ResourcePackStackPacket from '../packet/ResourcePackStackPacket';
import StartGamePacket from '../packet/StartGamePacket';
import ResourcePackStatusType from '../type/ResourcePackStatusType';
import { joinContentPayloads } from '../contentPayloads';
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

        switch (packet.status) {
            case ResourcePackStatusType.Refused:
                await player.kick('Declined the resource packs', DisconnectReason.RESOURCE_PACK_PROBLEM);
                return;

            case ResourcePackStatusType.SendPacks:
                logger.debug(
                    `${player.getName()} asked for ${packet.packIds.length} resource pack(s); the server offers none`,
                    'ResourcePackClientResponseHandler/handle'
                );
                await player.kick(
                    'Asked for resource packs this server does not have',
                    DisconnectReason.RESOURCE_PACK_PROBLEM
                );
                return;

            case ResourcePackStatusType.HaveAllPacks: {
                if (this.joined.has(session)) {
                    logger.debug(
                        `${player.getName()} said it had all packs after its join started; dropped`,
                        'ResourcePackClientResponseHandler/handle'
                    );
                    return;
                }

                const resourcePackStack = new ResourcePackStackPacket();
                resourcePackStack.texturePackRequired = false;
                resourcePackStack.experimentsAlreadyEnabled = false;
                await session.getConnection().sendDataPacket(resourcePackStack);
                return;
            }

            case ResourcePackStatusType.Completed:
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
                    `Dropped a resource pack response with unknown status ${packet.status} from ${player.getName()}`,
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
     *    treats game packets as malformed and drops with `InitialConnection-90`.
     * 3. `ItemRegistry` (our `ItemRegistryPacket`), `AvailableActorIdentifiers`,
     *    `BiomeDefinitionList`, `FeatureRegistry`, `CreativeContent`, `CraftingData`,
     *    `AvailableCommands`. The registries the client builds its world from; it needs them
     *    before anything that references an item, an actor type or a biome. The feature
     *    registry is empty, as a dedicated server's is for a world with no custom features.
     * 4. `PlayerList`. Added to everyone's list and sent the whole list. The client keys the
     *    list on uuids it only has after StartGame.
     * 5. `SetTime`, `SetSpawnPosition`. World state, once there is a world to apply it to.
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
        // wrote before the content build existed.
        const payloads = joinContentPayloads(server.getContent(), server.getLogger());

        await connection.sendDataPacket(new JigsawStructureDataPacket());

        const startGame = new StartGamePacket();
        startGame.entityId = player.getRuntimeId();
        startGame.runtimeEntityId = player.getRuntimeId();
        startGame.gamemode = player.gamemode;
        startGame.defaultGamemode = getGametypeId(server.getConfig().getGamemode());
        startGame.difficulty = server.getConfig().getDifficulty();
        startGame.dimension = world.getDimension().id;
        // Only two generator types exist here. A plugin's generator is reported as Overworld,
        // which is what the client assumes for terrain it did not make itself.
        startGame.generator = world.getGenerator() instanceof Flat ? Generator.FLAT : Generator.OVERWORLD;

        const worldSpawnPos = await world.getSpawnPosition();
        startGame.worldSpawnPos = worldSpawnPos;

        // BDS reports where the spawn point asked for, not where the player ended up; the
        // final spot follows in the Respawn that releases the client.
        const joinSpawn = player.getJoinSpawn();
        startGame.playerPos = joinSpawn ? eyePositionAt(joinSpawn.requested) : player.getPosition();
        startGame.pitch = player.pitch;
        startGame.yaw = player.yaw;

        startGame.serverIdentifier = 'JSPrismarine';
        startGame.worldIdentifier = world.getName();
        startGame.scenarioIdentifier = 'JSPrismarine';
        startGame.levelId = world.getUUID();
        startGame.ticks = server.getTick();
        startGame.time = world.getTicks();
        startGame.worldName = world.getName();
        startGame.seed = world.getSeed();
        startGame.serverAuthoritativeBlockBreaking = server.getConfig().getServerAuthoritativeBlockBreaking();
        startGame.gameRules = world.getGameRuleManager();
        // Every block the content build holds that the client's own palette
        // does not, which with hashed runtime ids is the only way a block
        // this server invented resolves to anything on the client.
        startGame.blockProperties = payloads?.blockProperties ?? null;
        await connection.sendDataPacket(startGame);

        // Every item the content build resolved, with the numbers the
        // captured table gives them. Without it a pack's own item has no row
        // the client could resolve it through.
        const itemRegistry = new ItemRegistryPacket();
        itemRegistry.entries = payloads?.items ?? null;
        await connection.sendDataPacket(itemRegistry);

        // Register each type's render-facing properties before any actor of that type spawns.
        for (const type of server.getContent().entities.registry.values()) {
            const propertyPacket = syncActorPropertyPacket(type.identifier, type.entity.description.properties);
            if (propertyPacket !== undefined) await connection.sendDataPacket(propertyPacket);
        }

        await connection.sendDataPacket(new AvailableActorIdentifiersPacket());
        await connection.sendDataPacket(new BiomeDefinitionListPacket());
        await connection.sendDataPacket(new FeatureRegistryPacket());
        await session.sendCreativeContents();
        await session.sendCraftingData();
        await session.sendAvailableCommands();

        await session.addToPlayerList();
        await session.sendPlayerList();

        await session.sendTime(world.getTicks());

        // The world spawn is a `Vector3` and may be fractional, while both positions in this
        // packet are `BlockPos`. A ZigZag varint write truncates toward zero without a word,
        // so a spawn at -0.5 would have been sent as block 0 rather than block -1.
        const setSpawnPos = new SetSpawnPositionPacket();
        setSpawnPos.dimension = world.getDimension().id;
        setSpawnPos.position = BlockPosition.fromVector3(worldSpawnPos);
        setSpawnPos.blockPosition = setSpawnPos.position;
        setSpawnPos.type = SpawnPositionType.PlayerRespawn;
        await connection.sendDataPacket(setSpawnPos);

        await player.sendSettings();
        await session.sendAttributes();
        await session.sendMetadata();

        await session.sendInventory();

        // A packet object encodes once and keeps its bytes, so each of these is its own.
        for (const [position, state, runtimeEntityId] of ResourcePackClientResponseHandler.joinRespawns(player)) {
            const respawn = new RespawnPacket();
            respawn.position = position;
            respawn.state = state;
            respawn.runtimeEntityId = runtimeEntityId;
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
