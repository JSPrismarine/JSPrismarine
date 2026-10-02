import { ByteOrder, NBTReader } from '@jsprismarine/nbt';

import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

export interface Vec3Like {
    x: number;
    y: number;
    z: number;
}

/** What kind of value a game rule carries, which is written in front of the value. */
export enum GameRuleType {
    NONE = 0,
    BOOL = 1,
    INT = 2,
    FLOAT = 3
}

export interface GameRule {
    name: string;
    /** Whether a player with the permission may change it from the client. */
    editable: boolean;
    type: GameRuleType;
    /** Ignored for {@link GameRuleType.NONE}. */
    value: boolean | number;
}

export interface ExperimentToggle {
    name: string;
    enabled: boolean;
}

/** A uuid as the wire carries it: two 64 bit halves, little endian, most significant first. */
export interface WireUUID {
    mostSignificantBits: bigint;
    leastSignificantBits: bigint;
}

/**
 * A block the client does not have built in, and the definition it needs to draw it.
 *
 * Since 1.26.50 this is not only a plugin's blocks: vanilla itself defines some of its blocks
 * in data - the wool stairs and slabs, the concrete slabs - and a real server declares those
 * here too, ninety-odd of them. The definition is carried as bytes rather than modelled: it is
 * network NBT that the server hands on verbatim and the client alone interprets.
 */
export interface BlockProperty {
    name: string;
    /** The definition as network NBT (varint string lengths), header byte included. */
    definition: Buffer;
}

export interface GatheringJoinInfo {
    experienceId?: WireUUID;
    experienceName?: string;
    worldId?: WireUUID;
    worldName?: string;
    creatorId?: string;
    targetId?: WireUUID;
    scenarioId?: string;
    serverId?: string;
}

export interface ServerJoinInformation {
    gathering?: GatheringJoinInfo;
    storeEntryPoint?: { storeId: string; storeName: string };
    presence?: { richPresenceId?: string };
}

export interface StartGame {
    /** The player's own entity id, signed and stable for the session. */
    entityId: bigint;
    /** The id everything on the wire refers to this player by. */
    runtimeEntityId: bigint;
    gamemode: number;
    position: Vec3Like;
    pitch: number;
    yaw: number;

    // Level settings, in wire order.
    seed: bigint;
    spawnBiomeType: number;
    userDefinedBiomeName: string;
    dimension: number;
    generator: number;
    worldGamemode: number;
    hardcore: boolean;
    difficulty: number;
    spawnPosition: Vec3Like;
    achievementsDisabled: boolean;
    editorWorldType: number;
    createdInEditor: boolean;
    exportedFromEditor: boolean;
    dayCycleStopTime: number;
    educationEditionOffer: number;
    educationFeaturesEnabled: boolean;
    educationProductId: string;
    rainLevel: number;
    lightningLevel: number;
    confirmedPlatformLockedContent: boolean;
    multiplayerGame: boolean;
    lanBroadcast: boolean;
    xboxLiveBroadcastSetting: number;
    platformBroadcastSetting: number;
    commandsEnabled: boolean;
    texturePacksRequired: boolean;
    gameRules: GameRule[];
    experiments: ExperimentToggle[];
    experimentsEverToggled: boolean;
    bonusChestEnabled: boolean;
    startWithMapEnabled: boolean;
    playerPermissions: number;
    serverChunkTickRange: number;
    hasLockedBehaviorPack: boolean;
    hasLockedResourcePack: boolean;
    isFromLockedTemplate: boolean;
    useMsaGamertagsOnly: boolean;
    isFromWorldTemplate: boolean;
    isWorldTemplateOptionLocked: boolean;
    onlySpawnV1Villagers: boolean;
    personaDisabled: boolean;
    customSkinsDisabled: boolean;
    emoteChatMuted: boolean;
    baseGameVersion: string;
    limitedWorldWidth: number;
    limitedWorldDepth: number;
    newNether: boolean;
    eduSharedUriResource: { buttonName: string; linkUri: string };
    /** Optional on the wire: absent means the world's own setting stands. */
    forceExperimentalGameplay?: boolean;
    chatRestrictionLevel: number;
    disablePlayerInteractions: boolean;
    serverEditorConnectionPolicy: number;
    allowAnonymousBlockDropsInEditorWorlds: boolean;

    levelId: string;
    levelName: string;
    templateContentIdentity: string;
    isTrial: boolean;
    /** How many ticks of input the client keeps for the server to rewind to. */
    rewindHistorySize: number;
    serverAuthoritativeBlockBreaking: boolean;
    currentTick: bigint;
    enchantmentSeed: number;
    blockProperties: BlockProperty[];
    multiplayerCorrelationId: string;
    enableItemStackNetManager: boolean;
    serverVersion: string;
    /** Network NBT, handed on as bytes for the same reason a block definition is. */
    playerPropertyData: Buffer;
    blockRegistryChecksum: bigint;
    worldTemplateId: WireUUID;
    clientSideGeneration: boolean;
    blockNetworkIdsAreHashes: boolean;
    serverAuthoritativeSound: boolean;
    /** Optional on the wire; `undefined` writes the single byte saying there is none. */
    serverJoinInformation?: ServerJoinInformation;
    serverId: string;
    scenarioId: string;
    worldId: string;
    ownerId: string;
}

/** An empty network NBT compound: the type byte, an empty name, and the end tag. */
export const EMPTY_COMPOUND = Buffer.from([0x0a, 0x00, 0x00]);

/**
 * Where the player is, who they are, and what world they are in.
 *
 * The layout is protocol 2193's (Minecraft 1.26.50), and every field of it is read and
 * written: this was checked by decoding the packet a Bedrock Dedicated Server 1.26.51 sends
 * and writing it back out byte for byte. Two things about the layout are worth naming
 * because both are easy to get wrong from older descriptions of it:
 *
 * - The movement settings are a rewind history size and a block breaking flag, and nothing
 *   else. The movement *mode* that used to lead them went with 1.21.90, when client
 *   authoritative movement was retired; a server that still writes it puts every field after
 *   it one byte out.
 * - An integer game rule is four little endian bytes, not a varint.
 *
 * The NBT this carries - each block definition, the player property data - is kept as bytes.
 * The client alone interprets it, so modelling it here would be work that only creates ways
 * to disagree with the server that produced it.
 */
export default class StartGamePacket extends NetworkPacket<StartGame> {
    public get id(): number {
        return PacketIdentifier.START_GAME;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: StartGame): void {
        stream.writeVarLong(data.entityId);
        stream.writeUnsignedVarLong(data.runtimeEntityId);
        stream.writeVarInt(data.gamemode);
        writeVec3(stream, data.position);
        stream.writeFloatLE(data.pitch);
        stream.writeFloatLE(data.yaw);

        stream.writeUnsignedLongLE(data.seed);
        stream.writeShortLE(data.spawnBiomeType);
        stream.writeString(data.userDefinedBiomeName);
        stream.writeVarInt(data.dimension);
        stream.writeVarInt(data.generator);
        stream.writeVarInt(data.worldGamemode);
        stream.writeBoolean(data.hardcore);
        stream.writeVarInt(data.difficulty);
        stream.writeVarInt(data.spawnPosition.x);
        stream.writeVarInt(data.spawnPosition.y);
        stream.writeVarInt(data.spawnPosition.z);
        stream.writeBoolean(data.achievementsDisabled);
        stream.writeVarInt(data.editorWorldType);
        stream.writeBoolean(data.createdInEditor);
        stream.writeBoolean(data.exportedFromEditor);
        stream.writeVarInt(data.dayCycleStopTime);
        stream.writeUnsignedVarInt(data.educationEditionOffer);
        stream.writeBoolean(data.educationFeaturesEnabled);
        stream.writeString(data.educationProductId);
        stream.writeFloatLE(data.rainLevel);
        stream.writeFloatLE(data.lightningLevel);
        stream.writeBoolean(data.confirmedPlatformLockedContent);
        stream.writeBoolean(data.multiplayerGame);
        stream.writeBoolean(data.lanBroadcast);
        stream.writeVarInt(data.xboxLiveBroadcastSetting);
        stream.writeVarInt(data.platformBroadcastSetting);
        stream.writeBoolean(data.commandsEnabled);
        stream.writeBoolean(data.texturePacksRequired);

        stream.writeUnsignedVarInt(data.gameRules.length);
        for (const rule of data.gameRules) {
            stream.writeString(rule.name);
            stream.writeBoolean(rule.editable);
            stream.writeUnsignedVarInt(rule.type);
            switch (rule.type) {
                case GameRuleType.BOOL:
                    stream.writeBoolean(Boolean(rule.value));
                    break;
                case GameRuleType.INT:
                    stream.writeIntLE(Number(rule.value));
                    break;
                case GameRuleType.FLOAT:
                    stream.writeFloatLE(Number(rule.value));
                    break;
                default:
                    break;
            }
        }

        // The one list in the packet counted by a fixed 32 bit integer.
        stream.writeUnsignedIntLE(data.experiments.length);
        for (const experiment of data.experiments) {
            stream.writeString(experiment.name);
            stream.writeBoolean(experiment.enabled);
        }
        stream.writeBoolean(data.experimentsEverToggled);

        stream.writeBoolean(data.bonusChestEnabled);
        stream.writeBoolean(data.startWithMapEnabled);
        stream.writeSignedByte(data.playerPermissions);
        stream.writeIntLE(data.serverChunkTickRange);
        stream.writeBoolean(data.hasLockedBehaviorPack);
        stream.writeBoolean(data.hasLockedResourcePack);
        stream.writeBoolean(data.isFromLockedTemplate);
        stream.writeBoolean(data.useMsaGamertagsOnly);
        stream.writeBoolean(data.isFromWorldTemplate);
        stream.writeBoolean(data.isWorldTemplateOptionLocked);
        stream.writeBoolean(data.onlySpawnV1Villagers);
        stream.writeBoolean(data.personaDisabled);
        stream.writeBoolean(data.customSkinsDisabled);
        stream.writeBoolean(data.emoteChatMuted);
        stream.writeString(data.baseGameVersion);
        stream.writeIntLE(data.limitedWorldWidth);
        stream.writeIntLE(data.limitedWorldDepth);
        stream.writeBoolean(data.newNether);
        stream.writeString(data.eduSharedUriResource.buttonName);
        stream.writeString(data.eduSharedUriResource.linkUri);

        stream.writeBoolean(data.forceExperimentalGameplay !== undefined);
        if (data.forceExperimentalGameplay !== undefined) stream.writeBoolean(data.forceExperimentalGameplay);

        stream.writeByte(data.chatRestrictionLevel);
        stream.writeBoolean(data.disablePlayerInteractions);
        stream.writeVarInt(data.serverEditorConnectionPolicy);
        stream.writeBoolean(data.allowAnonymousBlockDropsInEditorWorlds);

        stream.writeString(data.levelId);
        stream.writeString(data.levelName);
        stream.writeString(data.templateContentIdentity);
        stream.writeBoolean(data.isTrial);
        stream.writeVarInt(data.rewindHistorySize);
        stream.writeBoolean(data.serverAuthoritativeBlockBreaking);
        stream.writeUnsignedLongLE(data.currentTick);
        stream.writeVarInt(data.enchantmentSeed);

        stream.writeUnsignedVarInt(data.blockProperties.length);
        for (const block of data.blockProperties) {
            stream.writeString(block.name);
            stream.write(block.definition);
        }

        stream.writeString(data.multiplayerCorrelationId);
        stream.writeBoolean(data.enableItemStackNetManager);
        stream.writeString(data.serverVersion);
        stream.write(data.playerPropertyData);
        stream.writeUnsignedLongLE(data.blockRegistryChecksum);
        writeUUID(stream, data.worldTemplateId);
        stream.writeBoolean(data.clientSideGeneration);
        stream.writeBoolean(data.blockNetworkIdsAreHashes);
        stream.writeBoolean(data.serverAuthoritativeSound);

        const join = data.serverJoinInformation;
        stream.writeBoolean(join !== undefined);
        if (join !== undefined) {
            stream.writeBoolean(join.gathering !== undefined);
            if (join.gathering !== undefined) {
                const gathering = join.gathering;
                writeOptional(stream, gathering.experienceId, (id) => writeUUID(stream, id));
                writeOptional(stream, gathering.experienceName, (name) => stream.writeString(name));
                writeOptional(stream, gathering.worldId, (id) => writeUUID(stream, id));
                writeOptional(stream, gathering.worldName, (name) => stream.writeString(name));
                writeOptional(stream, gathering.creatorId, (id) => stream.writeString(id));
                writeOptional(stream, gathering.targetId, (id) => writeUUID(stream, id));
                writeOptional(stream, gathering.scenarioId, (id) => stream.writeString(id));
                writeOptional(stream, gathering.serverId, (id) => stream.writeString(id));
            }

            stream.writeBoolean(join.storeEntryPoint !== undefined);
            if (join.storeEntryPoint !== undefined) {
                stream.writeString(join.storeEntryPoint.storeId);
                stream.writeString(join.storeEntryPoint.storeName);
            }

            stream.writeBoolean(join.presence !== undefined);
            if (join.presence !== undefined) {
                writeOptional(stream, join.presence.richPresenceId, (id) => stream.writeString(id));
            }
        }

        stream.writeString(data.serverId);
        stream.writeString(data.scenarioId);
        stream.writeString(data.worldId);
        stream.writeString(data.ownerId);
    }

    protected deserializePayload(stream: NetworkBinaryStream): StartGame {
        const entityId = stream.readVarLong();
        const runtimeEntityId = stream.readUnsignedVarLong();
        const gamemode = stream.readVarInt();
        const position = readVec3(stream);
        const pitch = stream.readFloatLE();
        const yaw = stream.readFloatLE();

        const seed = stream.readUnsignedLongLE();
        const spawnBiomeType = stream.readShortLE();
        const userDefinedBiomeName = stream.readString();
        const dimension = stream.readVarInt();
        const generator = stream.readVarInt();
        const worldGamemode = stream.readVarInt();
        const hardcore = stream.readBoolean();
        const difficulty = stream.readVarInt();
        const spawnPosition = { x: stream.readVarInt(), y: stream.readVarInt(), z: stream.readVarInt() };
        const achievementsDisabled = stream.readBoolean();
        const editorWorldType = stream.readVarInt();
        const createdInEditor = stream.readBoolean();
        const exportedFromEditor = stream.readBoolean();
        const dayCycleStopTime = stream.readVarInt();
        const educationEditionOffer = stream.readUnsignedVarInt();
        const educationFeaturesEnabled = stream.readBoolean();
        const educationProductId = stream.readString();
        const rainLevel = stream.readFloatLE();
        const lightningLevel = stream.readFloatLE();
        const confirmedPlatformLockedContent = stream.readBoolean();
        const multiplayerGame = stream.readBoolean();
        const lanBroadcast = stream.readBoolean();
        const xboxLiveBroadcastSetting = stream.readVarInt();
        const platformBroadcastSetting = stream.readVarInt();
        const commandsEnabled = stream.readBoolean();
        const texturePacksRequired = stream.readBoolean();

        const gameRules: GameRule[] = [];
        for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
            const name = stream.readString();
            const editable = stream.readBoolean();
            const type = stream.readUnsignedVarInt() as GameRuleType;
            let value: boolean | number = false;
            switch (type) {
                case GameRuleType.BOOL:
                    value = stream.readBoolean();
                    break;
                case GameRuleType.INT:
                    value = stream.readIntLE();
                    break;
                case GameRuleType.FLOAT:
                    value = stream.readFloatLE();
                    break;
                case GameRuleType.NONE:
                    break;
                default:
                    throw new Error(`Game rule ${name} has an unknown value type ${type}`);
            }
            gameRules.push({ name, editable, type, value });
        }

        const experiments: ExperimentToggle[] = [];
        for (let i = 0, count = stream.readUnsignedIntLE(); i < count; i++) {
            experiments.push({ name: stream.readString(), enabled: stream.readBoolean() });
        }
        const experimentsEverToggled = stream.readBoolean();

        const bonusChestEnabled = stream.readBoolean();
        const startWithMapEnabled = stream.readBoolean();
        const playerPermissions = stream.readSignedByte();
        const serverChunkTickRange = stream.readIntLE();
        const hasLockedBehaviorPack = stream.readBoolean();
        const hasLockedResourcePack = stream.readBoolean();
        const isFromLockedTemplate = stream.readBoolean();
        const useMsaGamertagsOnly = stream.readBoolean();
        const isFromWorldTemplate = stream.readBoolean();
        const isWorldTemplateOptionLocked = stream.readBoolean();
        const onlySpawnV1Villagers = stream.readBoolean();
        const personaDisabled = stream.readBoolean();
        const customSkinsDisabled = stream.readBoolean();
        const emoteChatMuted = stream.readBoolean();
        const baseGameVersion = stream.readString();
        const limitedWorldWidth = stream.readIntLE();
        const limitedWorldDepth = stream.readIntLE();
        const newNether = stream.readBoolean();
        const eduSharedUriResource = { buttonName: stream.readString(), linkUri: stream.readString() };
        const forceExperimentalGameplay = stream.readBoolean() ? stream.readBoolean() : undefined;
        const chatRestrictionLevel = stream.readByte();
        const disablePlayerInteractions = stream.readBoolean();
        const serverEditorConnectionPolicy = stream.readVarInt();
        const allowAnonymousBlockDropsInEditorWorlds = stream.readBoolean();

        const levelId = stream.readString();
        const levelName = stream.readString();
        const templateContentIdentity = stream.readString();
        const isTrial = stream.readBoolean();
        const rewindHistorySize = stream.readVarInt();
        const serverAuthoritativeBlockBreaking = stream.readBoolean();
        const currentTick = stream.readUnsignedLongLE();
        const enchantmentSeed = stream.readVarInt();

        const blockProperties: BlockProperty[] = [];
        for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
            blockProperties.push({ name: stream.readString(), definition: readNBT(stream) });
        }

        const multiplayerCorrelationId = stream.readString();
        const enableItemStackNetManager = stream.readBoolean();
        const serverVersion = stream.readString();
        const playerPropertyData = readNBT(stream);
        const blockRegistryChecksum = stream.readUnsignedLongLE();
        const worldTemplateId = readUUID(stream);
        const clientSideGeneration = stream.readBoolean();
        const blockNetworkIdsAreHashes = stream.readBoolean();
        const serverAuthoritativeSound = stream.readBoolean();

        let serverJoinInformation: ServerJoinInformation | undefined;
        if (stream.readBoolean()) {
            serverJoinInformation = {};

            if (stream.readBoolean()) {
                const gathering: GatheringJoinInfo = {};
                gathering.experienceId = readOptional(stream, () => readUUID(stream));
                gathering.experienceName = readOptional(stream, () => stream.readString());
                gathering.worldId = readOptional(stream, () => readUUID(stream));
                gathering.worldName = readOptional(stream, () => stream.readString());
                gathering.creatorId = readOptional(stream, () => stream.readString());
                gathering.targetId = readOptional(stream, () => readUUID(stream));
                gathering.scenarioId = readOptional(stream, () => stream.readString());
                gathering.serverId = readOptional(stream, () => stream.readString());
                serverJoinInformation.gathering = gathering;
            }

            if (stream.readBoolean()) {
                serverJoinInformation.storeEntryPoint = {
                    storeId: stream.readString(),
                    storeName: stream.readString()
                };
            }

            if (stream.readBoolean()) {
                serverJoinInformation.presence = { richPresenceId: readOptional(stream, () => stream.readString()) };
            }
        }

        const serverId = stream.readString();
        const scenarioId = stream.readString();
        const worldId = stream.readString();
        const ownerId = stream.readString();

        return {
            entityId,
            runtimeEntityId,
            gamemode,
            position,
            pitch,
            yaw,
            seed,
            spawnBiomeType,
            userDefinedBiomeName,
            dimension,
            generator,
            worldGamemode,
            hardcore,
            difficulty,
            spawnPosition,
            achievementsDisabled,
            editorWorldType,
            createdInEditor,
            exportedFromEditor,
            dayCycleStopTime,
            educationEditionOffer,
            educationFeaturesEnabled,
            educationProductId,
            rainLevel,
            lightningLevel,
            confirmedPlatformLockedContent,
            multiplayerGame,
            lanBroadcast,
            xboxLiveBroadcastSetting,
            platformBroadcastSetting,
            commandsEnabled,
            texturePacksRequired,
            gameRules,
            experiments,
            experimentsEverToggled,
            bonusChestEnabled,
            startWithMapEnabled,
            playerPermissions,
            serverChunkTickRange,
            hasLockedBehaviorPack,
            hasLockedResourcePack,
            isFromLockedTemplate,
            useMsaGamertagsOnly,
            isFromWorldTemplate,
            isWorldTemplateOptionLocked,
            onlySpawnV1Villagers,
            personaDisabled,
            customSkinsDisabled,
            emoteChatMuted,
            baseGameVersion,
            limitedWorldWidth,
            limitedWorldDepth,
            newNether,
            eduSharedUriResource,
            ...(forceExperimentalGameplay === undefined ? {} : { forceExperimentalGameplay }),
            chatRestrictionLevel,
            disablePlayerInteractions,
            serverEditorConnectionPolicy,
            allowAnonymousBlockDropsInEditorWorlds,
            levelId,
            levelName,
            templateContentIdentity,
            isTrial,
            rewindHistorySize,
            serverAuthoritativeBlockBreaking,
            currentTick,
            enchantmentSeed,
            blockProperties,
            multiplayerCorrelationId,
            enableItemStackNetManager,
            serverVersion,
            playerPropertyData,
            blockRegistryChecksum,
            worldTemplateId,
            clientSideGeneration,
            blockNetworkIdsAreHashes,
            serverAuthoritativeSound,
            ...(serverJoinInformation === undefined ? {} : { serverJoinInformation }),
            serverId,
            scenarioId,
            worldId,
            ownerId
        };
    }
}

const writeVec3 = (stream: NetworkBinaryStream, vector: Vec3Like): void => {
    stream.writeFloatLE(vector.x);
    stream.writeFloatLE(vector.y);
    stream.writeFloatLE(vector.z);
};

const readVec3 = (stream: NetworkBinaryStream): Vec3Like => ({
    x: stream.readFloatLE(),
    y: stream.readFloatLE(),
    z: stream.readFloatLE()
});

const writeUUID = (stream: NetworkBinaryStream, uuid: WireUUID): void => {
    stream.writeUnsignedLongLE(uuid.mostSignificantBits);
    stream.writeUnsignedLongLE(uuid.leastSignificantBits);
};

const readUUID = (stream: NetworkBinaryStream): WireUUID => ({
    mostSignificantBits: stream.readUnsignedLongLE(),
    leastSignificantBits: stream.readUnsignedLongLE()
});

const writeOptional = <T>(stream: NetworkBinaryStream, value: T | undefined, write: (value: T) => void): void => {
    stream.writeBoolean(value !== undefined);
    if (value !== undefined) write(value);
};

const readOptional = <T>(stream: NetworkBinaryStream, read: () => T): T | undefined =>
    stream.readBoolean() ? read() : undefined;

/**
 * One network NBT compound, as the bytes it occupies.
 *
 * Parsed to find where it ends and then taken as a slice, because the length of NBT is only
 * known by reading it. The network dialect - varint string lengths - is the one on the wire
 * here; the other encoding of the same compound is a few bytes longer, and a reader on it
 * walks into whatever follows.
 */
const readNBT = (stream: NetworkBinaryStream): Buffer => {
    const start = stream.getReadIndex();

    const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
    reader.setUseVarint(true);
    reader.parse();

    return stream.getReadBuffer()!.subarray(start, stream.getReadIndex());
};
