import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import type { ProtocolContext } from '../ProtocolContext';
import { startGamePacket } from '../wire/definitions/startGame';
import { layoutAt } from '../wire/WireLayout';
import { SINCE_2225 } from '../wire/wireGates';

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

/** `EditorLevelMigrationVersion` values carried from protocol 2225. */
export enum EditorLevelMigrationVersion {
    Legacy = 0,
    EditorAchievements = 1
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
 * here too, ninety-odd of them. The definition is carried as bytes rather than modeled: it is
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
    /**
     * Which editor level migrations the world has had applied, an int8.
     *
     * Added to the level settings at protocol 2225 and absent from the 2193 wire, so this is
     * `undefined` on a 2193 packet and set on a 2225 one.
     */
    editorLevelMigrationVersion?: number;
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
    /**
     * Definitions to write in `Block Properties`. Omit to use the connection's
     * {@link ProtocolContext.blockDefinitions}; an empty list sends no definitions.
     */
    blockProperties?: BlockProperty[];
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
 * Who the joining player is, where they are, and what world they are in.
 *
 * The protocol-stamped layout carries the 2193 fields and adds `Editor Level Migration Version`
 * at 2225. Block definitions can come from this packet's payload or the connection's
 * {@link ProtocolContext}; omitting the payload list uses the context, while an empty list
 * sends none. The server supplies them, and this package writes them.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/start-game-packet/
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/start-game-packet/
 */
export default class StartGamePacket extends NetworkPacket<StartGame> {
    /** Returns the wire identifier for Start Game. */
    public get id(): number {
        return PacketIdentifier.START_GAME;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: StartGame, context?: ProtocolContext): void {
        const wireData = {
            ...data,
            forceExperimentalGameplay: data.forceExperimentalGameplay ?? null,
            editorLevelMigrationVersion: data.editorLevelMigrationVersion ?? EditorLevelMigrationVersion.Legacy,
            serverJoinInformation: data.serverJoinInformation ?? null,
            blockProperties: data.blockProperties ?? [...(context?.blockDefinitions ?? [])]
        };
        layoutAt(startGamePacket, this.codecProtocol).encode(stream, wireData);
    }

    protected deserializePayload(stream: NetworkBinaryStream): StartGame {
        const decoded = layoutAt(startGamePacket, this.codecProtocol).decode(stream);
        const { editorLevelMigrationVersion, forceExperimentalGameplay, serverJoinInformation, ...payload } = decoded;

        return {
            ...payload,
            ...(forceExperimentalGameplay === null ? {} : { forceExperimentalGameplay }),
            ...(serverJoinInformation === null ? {} : { serverJoinInformation }),
            ...(SINCE_2225.includedAt(this.codecProtocol) ? { editorLevelMigrationVersion } : {})
        };
    }
}
