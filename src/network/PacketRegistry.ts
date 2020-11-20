import type Prismarine from '../Prismarine';
import ActorFallHandler from './handler/ActorFallHandler';
import AdventureSettingsHandler from './handler/AdventureSettingsHandler';
import AnimateHandler from './handler/AnimateHandler';
import ClientCacheStatusHandler from './handler/ClientCacheStatusHandler';
import CommandRequestHandler from './handler/CommandRequestHandler';
import ContainerCloseHandler from './handler/ContainerCloseHandler';
import EmoteListHandler from './handler/EmoteListHandler';
import InteractHandler from './handler/InteractHandler';
import InventoryTransactionHandler from './handler/InventoryTransactionHandler';
import ItemStackRequestHandler from './handler/ItemStackRequestHandler';
import LevelSoundEventHandler from './handler/LevelSoundEventHandler';
import LoginHandler from './handler/LoginHandler';
import MobEquipmentHandler from './handler/MobEquipmentHandler';
import Identifiers from './Identifiers';
import ActorFallPacket from './packet/ActorFallPacket';
import AddActorPacket from './packet/AddActorPacket';
import AddPlayerPacket from './packet/AddPlayerPacket';
import AdventureSettingsPacket from './packet/AdventureSettingsPacket';
import AnimatePacket from './packet/AnimatePacket';
import AvailableActorIdentifiersPacket from './packet/AvailableActorIdentifiersPacket';
import AvailableCommandsPacket from './packet/AvailableCommandsPacket';
import BiomeDefinitionListPacket from './packet/BiomeDefinitionListPacket';
import ChunkRadiusUpdatedPacket from './packet/ChunkRadiusUpdatedPacket';
import ClientCacheStatusPacket from './packet/ClientCacheStatusPacket';
import CommandRequestPacket from './packet/CommandRequestPacket';
import ContainerClosePacket from './packet/ContainerClosePacket';
import ContainerOpenPacket from './packet/ContainerOpenPacket';
import CreativeContentPacket from './packet/CreativeContentPacket';
import DisconnectPacket from './packet/DisconnectPacket';
import EmoteListPacket from './packet/EmoteListPacket';
import InteractPacket from './packet/InteractPacket';
import InventoryContentPacket from './packet/InventoryContentPacket';
import InventoryTransactionPacket from './packet/InventoryTransactionPacket';
import ItemStackRequestPacket from './packet/ItemStackRequestPacket';
import ItemStackResponsePacket from './packet/ItemStackResponsePacket';
import LevelChunkPacket from './packet/LevelChunkPacket';
import LevelSoundEventPacket from './packet/LevelSoundEventPacket';
import LoginPacket from './packet/LoginPacket';
import MobEquipmentPacket from './packet/MobEquipmentPacket';
import MovePlayerPacket from './packet/MovePlayerPacket';
import MovePlayerHandler from './handler/MovePlayerHandler';
import NetworkChunkPublisherUpdatePacket from './packet/NetworkChunkPublisherUpdatePacket';
import PacketViolationWarningPacket from './packet/PacketViolationWarningPacket';
import PlayerActionPacket from './packet/PlayerActionPacket';
import PlayerListPacket from './packet/PlayerListPacket';
import PlayerSkinPacket from './packet/PlayerSkinPacket';
import PlayStatusPacket from './packet/PlayStatusPacket';
import RemoveActorPacket from './packet/RemoveActorPacket';
import RequestChunkRadiusPacket from './packet/RequestChunkRadiusPacket';
import ResourcePackResponsePacket from './packet/ResourcePackResponsePacket';
import ResourcePacksInfoPacket from './packet/ResourcePacksInfoPacket';
import ResourcePackStackPacket from './packet/ResourcePackStackPacket';
import ServerSettingsRequestPacket from './packet/ServerSettingsRequestPacket';
import SetActorDataPacket from './packet/SetActorDataPacket';
import SetGamemodePacket from './packet/SetGamemodePacket';
import SetLocalPlayerAsInitializedPacket from './packet/SetLocalPlayerAsInitializedPacket';
import SetTimePacket from './packet/SetTimePacket';
import SetTitlePacket from './packet/SetTitlePacket';
import StartGamePacket from './packet/StartGamePacket';
import TextPacket from './packet/TextPacket';
import TickSyncPacket from './packet/TickSyncPacket';
import UpdateAttributesPacket from './packet/UpdateAttributesPacket';
import UpdateBlockPacket from './packet/UpdateBlockPacket';
import WorldEventPacket from './packet/WorldEventPacket';
import PacketViolationWarningHandler from './handler/PacketViolationWarningHandler';
import PlayerActionHandler from './handler/PlayerActionHandler';
import RequestChunkRadiusHandler from './handler/RequestChunkRadiusHandler';
import ResourcePackResponseHandler from './handler/ResourcePackResponseHandler';
import SetLocalPlayerAsInitializedHandler from './handler/SetLocalPlayerAsInitializedHandler';
import TextHandler from './handler/TextHandler';
import TickSyncHandler from './handler/TickSyncHandler';

export default class PacketRegistry {
    private packets: Map<number, any> = new Map();
    private handlers: Map<number, any> = new Map();

    public constructor(server: Prismarine) {
        this.loadPackets(server);
        this.loadHandlers(server);
    }

    private registerPacket(packet: any, server: Prismarine): void {
        this.packets.set(packet.NetID, packet);
        server
            .getLogger()
            .silly(`Packet with id §b${packet.name}§r registered`);
    }

    private registerHandler(handler: any, server: Prismarine): void {
        this.handlers.set(handler.NetID, handler);
        server
            .getLogger()
            .silly(`Handler with id §b${handler.name}§r registered`);
    }

    private loadPackets(server: Prismarine): void {
        const time = Date.now();

        this.registerPacket(ActorFallPacket, server);
        this.registerPacket(AddActorPacket, server);
        this.registerPacket(AddPlayerPacket, server);
        this.registerPacket(AdventureSettingsPacket, server);
        this.registerPacket(AnimatePacket, server);
        this.registerPacket(AvailableActorIdentifiersPacket, server);
        this.registerPacket(AvailableCommandsPacket, server);
        this.registerPacket(BiomeDefinitionListPacket, server);
        this.registerPacket(ChunkRadiusUpdatedPacket, server);
        this.registerPacket(ClientCacheStatusPacket, server);
        this.registerPacket(CommandRequestPacket, server);
        this.registerPacket(ContainerClosePacket, server);
        this.registerPacket(ContainerOpenPacket, server);
        this.registerPacket(CreativeContentPacket, server);
        this.registerPacket(DisconnectPacket, server);
        this.registerPacket(EmoteListPacket, server);
        this.registerPacket(InteractPacket, server);
        this.registerPacket(InventoryContentPacket, server);
        this.registerPacket(InventoryTransactionPacket, server);
        this.registerPacket(ItemStackRequestPacket, server);
        this.registerPacket(ItemStackResponsePacket, server);
        this.registerPacket(LevelChunkPacket, server);
        this.registerPacket(LevelSoundEventPacket, server);
        this.registerPacket(LoginPacket, server);
        this.registerPacket(MobEquipmentPacket, server);
        this.registerPacket(MovePlayerPacket, server);
        this.registerPacket(NetworkChunkPublisherUpdatePacket, server);
        this.registerPacket(PacketViolationWarningPacket, server);
        this.registerPacket(PlayerActionPacket, server);
        this.registerPacket(PlayerListPacket, server);
        this.registerPacket(PlayerSkinPacket, server);
        this.registerPacket(PlayStatusPacket, server);
        this.registerPacket(RemoveActorPacket, server);
        this.registerPacket(RequestChunkRadiusPacket, server);
        this.registerPacket(ResourcePackResponsePacket, server);
        this.registerPacket(ResourcePacksInfoPacket, server);
        this.registerPacket(ResourcePackStackPacket, server);
        this.registerPacket(ServerSettingsRequestPacket, server);
        this.registerPacket(SetActorDataPacket, server);
        this.registerPacket(SetGamemodePacket, server);
        this.registerPacket(SetLocalPlayerAsInitializedPacket, server);
        this.registerPacket(SetTimePacket, server);
        this.registerPacket(SetTitlePacket, server);
        this.registerPacket(StartGamePacket, server);
        this.registerPacket(TextPacket, server);
        this.registerPacket(TickSyncPacket, server);
        this.registerPacket(UpdateAttributesPacket, server);
        this.registerPacket(UpdateBlockPacket, server);
        this.registerPacket(WorldEventPacket, server);

        server
            .getLogger()
            .debug(
                `Registered §b${this.packets.size}§r of §b${
                    Array.from(Object.keys(Identifiers)).length - 2
                }§r packet(s) (took ${Date.now() - time} ms)!`
            );
    }

    private loadHandlers(server: Prismarine): void {
        const time = Date.now();

        this.registerHandler(ActorFallHandler, server);
        this.registerHandler(AdventureSettingsHandler, server);
        this.registerHandler(AnimateHandler, server);
        this.registerHandler(ClientCacheStatusHandler, server);
        this.registerHandler(ContainerCloseHandler, server);
        this.registerHandler(CommandRequestHandler, server);
        this.registerHandler(EmoteListHandler, server);
        this.registerHandler(InteractHandler, server);
        this.registerHandler(InventoryTransactionHandler, server);
        this.registerHandler(ItemStackRequestHandler, server);
        this.registerHandler(LevelSoundEventHandler, server);
        this.registerHandler(LoginHandler, server);
        this.registerHandler(MobEquipmentHandler, server);
        this.registerHandler(MovePlayerHandler, server);
        this.registerHandler(PacketViolationWarningHandler, server);
        this.registerHandler(PlayerActionHandler, server);
        this.registerHandler(RequestChunkRadiusHandler, server);
        this.registerHandler(ResourcePackResponseHandler, server);
        this.registerHandler(SetLocalPlayerAsInitializedHandler, server);
        this.registerHandler(TextHandler, server);
        this.registerHandler(TickSyncHandler, server);

        server
            .getLogger()
            .debug(
                `Registered §b${this.handlers.size}§r packet handler(s) (took ${
                    Date.now() - time
                } ms)!`
            );
    }

    public getPackets(): Map<number, any> {
        return this.packets;
    }

    public getHandlers(): Map<number, any> {
        return this.handlers;
    }
}
