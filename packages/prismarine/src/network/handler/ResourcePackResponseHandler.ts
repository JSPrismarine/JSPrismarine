import Chat, { ChatType } from '../../chat/Chat';
// import RespawnPacket, { RespawnState } from '../packet/RespawnPacket';
import SetSpawnPositionPacket, { SpawnType } from '../packet/SetSpawnPositionPacket';

import AvailableActorIdentifiersPacket from '../packet/AvailableActorIdentifiersPacket';
import BiomeDefinitionListPacket from '../packet/BiomeDefinitionListPacket';
import ChatEvent from '../../events/chat/ChatEvent';
import Identifiers from '../Identifiers';
import ItemComponentPacket from '../packet/ItemComponentPacket';
import type PacketHandler from './PacketHandler';
import PlayStatusType from '../type/PlayStatusType';
import type { PlayerSession } from '../../';
import PlayerSpawnEvent from '../../events/player/PlayerSpawnEvent';
import type ResourcePackResponsePacket from '../packet/ResourcePackResponsePacket';
import ResourcePackStatusType from '../type/ResourcePackStatusType';
import Server from '../../Server';
import Vector3 from '../../math/Vector3';
import { Difficulty, Dimension, Gamemode, ServerAuthMovementMode, SpawnBiome } from '@jsprismarine/minecraft';
import { LevelSettings, SpawnSettings, SyncedPlayerMovementSettings, Vec2 } from '@jsprismarine/protocol';
import { PlayerPermissionLevel } from '@jsprismarine/minecraft';
import { StartGamePacket, ResourcePackStackPacket } from '@jsprismarine/protocol';
import { NBTTagCompound } from '@jsprismarine/nbt';

export default class ResourcePackResponseHandler implements PacketHandler<ResourcePackResponsePacket> {
    public static NetID = Identifiers.ResourcePackResponsePacket;

    public async handle(packet: ResourcePackResponsePacket, server: Server, session: PlayerSession): Promise<void> {
        if (packet.status === ResourcePackStatusType.HaveAllPacks) {
            await session
                .getConnection()
                .sendDataPacket2(new ResourcePackStackPacket(false, Identifiers.MinecraftVersion));
        } else if (packet.status === ResourcePackStatusType.Completed) {
            const player = session.getPlayer();
            // Emit playerSpawn event
            const spawnEvent = new PlayerSpawnEvent(player);
            server.getEventManager().post(['playerSpawn', spawnEvent]);
            if (spawnEvent.isCancelled()) return;

            // TODO: send inventory slots

            await session.addToPlayerList();

            const world = player.getWorld();

            await session.sendTime(world.getTicks());

            const startGame = new StartGamePacket(
                player.getRuntimeId(),
                player.getRuntimeId(),
                Gamemode.Gametype.WORLD_DEFAULT,
                new Vector3(player.getX(), player.getY(), player.getZ()),
                new Vec2(player.yaw, player.pitch),
                new LevelSettings(
                    BigInt(world.getSeed()),
                    new SpawnSettings(SpawnBiome.DEFAULT, 'plains', Dimension.OVERWORLD),
                    Difficulty.NORMAL,
                    await world.getSpawnPosition(),
                    world.getTicks(),
                    0,
                    0,
                    true,
                    new Set(),
                    PlayerPermissionLevel.MEMBER
                ),
                world.getUniqueId(),
                world.getName(),
                new SyncedPlayerMovementSettings(ServerAuthMovementMode.CLIENT_AUTHORITATIVE, 0, false),
                BigInt(world.getTicks()),
                server.getVersion(),
                new NBTTagCompound(),
                0n,
                false
            );
            await session.getConnection().sendDataPacket2(startGame);

            const itemComponent = new ItemComponentPacket();
            await session.getConnection().sendDataPacket(itemComponent);

            const setSpawPos = new SetSpawnPositionPacket();
            setSpawPos.dimension = 3; // TODO: enum
            setSpawPos.position = new Vector3(-2147483648, -2147483648, -2147483648);
            setSpawPos.blockPosition = setSpawPos.position;
            setSpawPos.type = SpawnType.PLAYER_SPAWN;
            await session.getConnection().sendDataPacket(setSpawPos);

            await session.sendTime(world.getTicks());

            // TODO: set difficulty packet
            // TODO: set commands enabled packet

            await session.sendSettings();
            await session.sendAbilities();

            // TODO: game rules changed packet

            await session.sendPlayerList();

            await session.getConnection().sendDataPacket(new BiomeDefinitionListPacket());
            await session.getConnection().sendDataPacket(new AvailableActorIdentifiersPacket());

            // TODO: player fog packet

            await session.sendAttributes(player.getAttributeManager().getDefaults());

            await session.sendMetadata();

            await session.sendCreativeContents();

            // Some packets...

            // TODO: inventory crafting data

            // TODO: available commands

            /* const respawnPacket = new RespawnPacket();
            respawnPacket.state = RespawnState.SERVER_SEARCHING_FOR_SPAWN;
            respawnPacket.position = await world.getSpawnPosition();
            respawnPacket.runtimeEntityId = player.getRuntimeId();
            await session.getConnection().sendDataPacket(respawnPacket);

            respawnPacket.state = RespawnState.SERVER_READY_TO_SPAWN;
            await session.getConnection().sendDataPacket(respawnPacket);
            await session.getConnection().sendDataPacket(respawnPacket); */

            /// TODO: general handler refactor ///

            // Sent to let know the client saved chunks
            // TODO
            session
                .getPlayer()
                .sendInitialSpawnChunks()
                .then(
                    async () => {
                        // todo: set health packet
                        await session.sendPlayStatus(PlayStatusType.PlayerSpawn);
                    },
                    () =>
                        server
                            .getLogger()
                            ?.error(
                                `Failed to spawn player[${session.getConnection().getRakNetSession().getAddress()}]`
                            )
                )
                .finally(async () => {
                    // Summon player(s) & entities
                    await Promise.all([
                        server
                            .getSessionManager()
                            .getAllPlayers()
                            .filter((p) => p !== player)
                            .map(async (p) => {
                                await p.getNetworkSession().sendSpawn(player);
                                await session.sendSpawn(p);
                            }),
                        player
                            .getWorld()
                            .getEntities()
                            .filter((e) => !e.isPlayer())
                            .map(async (entity) => entity.sendSpawn(player))
                    ]);
                });

            server
                .getLogger()
                ?.info(
                    `§b${player.getName()}§f is attempting to join with id §b${player.getRuntimeId()}§f from ${player
                        .getAddress()
                        .getAddress()}:${player.getAddress().getPort()}`,
                    'Handler/ResourcePackResponseHandler'
                );

            player.setNameTag(player.getName());
            // TODO: always visible nametag

            // TODO: fix await player.getConnection().sendInventory();

            // Announce connection
            const chatSpawnEvent = new ChatEvent(
                new Chat(
                    server.getConsole(),
                    `§e%multiplayer.player.joined`, // TODO: enum of client hardcoded messages
                    [player.getName()],
                    true,
                    '*.everyone',
                    ChatType.TRANSLATION
                )
            );
            await server.getEventManager().emit('chat', chatSpawnEvent);
        }
    }
}
