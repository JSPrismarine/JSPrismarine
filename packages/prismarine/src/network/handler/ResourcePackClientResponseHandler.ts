import { Chat, ChatType } from '../../chat/Chat';
import RespawnPacket, { RespawnState } from '../packet/RespawnPacket';
import SetSpawnPositionPacket, { SpawnType } from '../packet/SetSpawnPositionPacket';

import type { Vector3 } from '@jsprismarine/math';
import { Generator, getGametypeId } from '@jsprismarine/minecraft';
import type { Player, PlayerSession } from '../../';
import { eyePositionAt } from '../../entity/Human';
import type Server from '../../Server';
import ChatEvent from '../../events/chat/ChatEvent';
import PlayerSpawnEvent from '../../events/player/PlayerSpawnEvent';
import Flat from '../../world/generators/Flat';
import Identifiers from '../Identifiers';
import AvailableActorIdentifiersPacket from '../packet/AvailableActorIdentifiersPacket';
import BiomeDefinitionListPacket from '../packet/BiomeDefinitionListPacket';
import ItemRegistryPacket from '../packet/ItemRegistryPacket';
import JigsawStructureDataPacket from '../packet/JigsawStructureDataPacket';
import type ResourcePackClientResponsePacket from '../packet/ResourcePackClientResponsePacket';
import ResourcePackStackPacket from '../packet/ResourcePackStackPacket';
import StartGamePacket from '../packet/StartGamePacket';
import ResourcePackStatusType from '../type/ResourcePackStatusType';
import type PacketHandler from './PacketHandler';

/**
 * Drives the end of the login exchange, from the client's answer about resource packs to the
 * burst of registries and world state that puts it in a world.
 */
export default class ResourcePackClientResponseHandler implements PacketHandler<ResourcePackClientResponsePacket> {
    public static NetID = Identifiers.ResourcePackClientResponsePacket;

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
    private static joinRespawns(player: Player): Array<[Vector3, RespawnState, bigint]> {
        const joinSpawn = player.getJoinSpawn();
        if (joinSpawn === null) return [];

        return [
            [eyePositionAt(joinSpawn.requested), RespawnState.SERVER_SEARCHING_FOR_SPAWN, 0n],
            [joinSpawn.requested, RespawnState.SERVER_SEARCHING_FOR_SPAWN, 0n],
            [eyePositionAt(joinSpawn.position), RespawnState.SERVER_READY_TO_SPAWN, 0n]
        ];
    }

    /**
     * Answers `HaveAllPacks` with the stack and `Completed` with the join.
     *
     * Known gap: the other two statuses do nothing. `SendPacks` names the packs in
     * `Downloading Packs` and expects a `ResourcePackDataInfo` for each, and `Refused` means the
     * player declined a required pack and should be disconnected. Neither can arrive while
     * `ResourcePacksInfoPacket` goes out with no packs and `Resource Pack Required` false.
     */
    public async handle(
        packet: ResourcePackClientResponsePacket,
        server: Server,
        session: PlayerSession
    ): Promise<void> {
        if (packet.status === ResourcePackStatusType.HaveAllPacks) {
            const resourcePackStack = new ResourcePackStackPacket();
            resourcePackStack.texturePackRequired = false;
            resourcePackStack.experimentsAlreadyEnabled = false;
            await session.getConnection().sendDataPacket(resourcePackStack);
        } else if (packet.status === ResourcePackStatusType.Completed) {
            await this.sendJoinBurst(server, session);
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
     *    `BiomeDefinitionList`, `CreativeContent`, `CraftingData`, `AvailableCommands`. The
     *    registries the client builds its world from; it needs them before anything that
     *    references an item, an actor type or a biome.
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
     * - `CLIENT_READY_TO_SPAWN`. This used to send it, and only a client sends that state.
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
        startGame.gameRules = world.getGameRuleManager();
        await connection.sendDataPacket(startGame);

        await connection.sendDataPacket(new ItemRegistryPacket());
        await connection.sendDataPacket(new AvailableActorIdentifiersPacket());
        await connection.sendDataPacket(new BiomeDefinitionListPacket());
        await session.sendCreativeContents();
        await session.sendCraftingData();
        await session.sendAvailableCommands();

        await session.addToPlayerList();
        await session.sendPlayerList();

        await session.sendTime(world.getTicks());

        const setSpawnPos = new SetSpawnPositionPacket();
        setSpawnPos.dimension = world.getDimension().id;
        setSpawnPos.position = worldSpawnPos;
        setSpawnPos.blockPosition = setSpawnPos.position;
        setSpawnPos.type = SpawnType.PLAYER_SPAWN;
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
                sender: server.getConsole()!,
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
