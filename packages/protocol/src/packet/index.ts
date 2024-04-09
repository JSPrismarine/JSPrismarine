import type { PacketData as LoginPacketData } from './Login';
import LoginPacket from './Login';
import PlayStatusPacket, { PlayStatus } from './PlayStatus';
import ServerToClientHandshake from './ServerToClientHandshake';
import ClientToServerHandshake from './ClientToServerHandshake';
import type { PacketData as MovePlayerPacketData } from './MovePlayer';
import MovePlayerPacket from './MovePlayer';
import StartGamePacket from './StartGame';
import type { PacketData as TextPacketData } from './Text';
import TextPacket, { MessageType } from './Text';
import SetTimePacket from './SetTime';
import ResourcePackStackPacket from './ResourcePackStack';
import ResourcePacksInfoPacket from './ResourcePacksInfo';
import ResourcePackClientResponsePacket, { type PacketData as ResourcePackClientResponsePacketData } from './ResourcePackClientResponse';
import RequestNetworkSettingsPacket, { type PacketData as RequestNetworkSettingsPacketData } from './RequestNetworkSettings';
import AddPlayerPacket from './AddPlayer';
import AddActorPacket from './AddActor';
import DisconnectPacket from './Disconnect';
import { LevelChunkPacket } from './LevelChunk';
import { NetworkChunkPublisherUpdatePacket } from './NetworkChunkPublisherUpdate';
import { RequestChunkRadiusPacket, type PacketData as RequestChunkRadiusPacketData } from './RequestChunkRadius';
import { ChunkRadiusUpdatedPacket, type PacketData as ChunkRadiusUpdatedPacketData } from './ChunkRadiusUpdated';
import { LevelEventGenericPacket, type PacketData as LevelEventGenericPacketData } from './LevelEventGeneric';
import { NetworkSettingsPacket } from './NetworkSettings';
import { TickSyncPacket, type PacketData as TickSyncPacketData } from './TickSync';

export namespace PacketData {
    export type Login = LoginPacketData;
    export type MovePlayer = MovePlayerPacketData;
    export type RequestChunkRadius = RequestChunkRadiusPacketData;
    export type ChunkRadiusUpdated = ChunkRadiusUpdatedPacketData;
    export type ResourcePackClientResponse = ResourcePackClientResponsePacketData;
    export type LevelEventGeneric = LevelEventGenericPacketData;
    export type NetworkSettings = NetworkSettingsPacket;
    export type TickSync = TickSyncPacketData;
    export type Text = TextPacketData;
    export type RequestNetworkSettings = RequestNetworkSettingsPacketData;
}

export {
    LoginPacket,
    PlayStatusPacket,
    PlayStatus,
    StartGamePacket,
    ServerToClientHandshake,
    ClientToServerHandshake,
    MovePlayerPacket,
    TextPacket,
    MessageType,
    SetTimePacket,
    ResourcePackStackPacket,
    ResourcePacksInfoPacket,
    ResourcePackClientResponsePacket,
    RequestNetworkSettingsPacket,
    AddPlayerPacket,
    AddActorPacket,
    DisconnectPacket,
    LevelChunkPacket,
    NetworkChunkPublisherUpdatePacket,
    RequestChunkRadiusPacket,
    ChunkRadiusUpdatedPacket,
    LevelEventGenericPacket,
    NetworkSettingsPacket,
    TickSyncPacket
};
