/**
 * `StartGamePacket`: who the joining player is, where they are, and what world they are in.
 *
 * Field names and order follow the docs' packet page and `packet/StartGamePacket.ts`, whose
 * layout was proven by round-tripping the packet a Bedrock Dedicated Server 1.26.51 sends.
 * Two things about the layout are worth naming because both are easy to get wrong from older
 * descriptions of it:
 *
 * - The movement settings are a rewind history size and a block breaking flag, and nothing
 *   else. The movement *mode* that used to lead them went with 1.21.90; a server that still
 *   writes it puts every field after it one byte out.
 * - An integer game rule is four little endian bytes, not a varint.
 *
 * `Editor Level Migration Version` was inserted at protocol 2225 as a plain int8 between
 * `Is Exported From Editor` and `Day Cycle Stop Time`, so every later level-settings field
 * moves one field later. Verified against the v1.26.60 `metadata.zip` (`LevelSettings.json`,
 * ordinal 11, the only added field) and gophertunnel's `StartGame.Marshal` at v1.63.0
 * (`io.Int8(&pk.EditorLevelMigrationVersion)` after `ExportedFromEditor`), which agree.
 *
 * The NBT this carries - each block definition, the player property data - is kept as bytes.
 * The client alone interprets it, so modeling it here would be work that only creates ways
 * to disagree with the server that produced it.
 */
import { ByteOrder, NBTReader } from '@jsprismarine/nbt';

import { GameRuleType } from '../../packet/StartGamePacket';
import { definePacket, gated } from '../define';
import * as t from '../fieldTypes';
import { SINCE_2225 } from '../wireGates';

import type BinaryStream from '@jsprismarine/binaryutils';
import type {
    BlockProperty,
    ExperimentToggle,
    GameRule,
    GatheringJoinInfo,
    ServerJoinInformation,
    WireUUID
} from '../../packet/StartGamePacket';
import type { PayloadOf } from '../define';

/** One `GameRule`: name, editability, a varuint type selector, then the typed value. */
const gameRule = t.custom<GameRule>(
    'GameRule',
    (stream, rule) => {
        t.string.write(stream, rule.name);
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
                break; // NONE carries no value.
        }
    },
    (stream) => {
        const name = t.string.read(stream);
        const editable = stream.readBoolean();
        const type: GameRuleType = stream.readUnsignedVarInt();
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

        return { name, editable, type, value };
    }
);

/** The experiment toggles: the one list in the packet counted by a fixed 32 bit integer. */
const experiments = t.custom<ExperimentToggle[]>(
    'ExperimentToggle[]',
    (stream, value) => {
        stream.writeUnsignedIntLE(value.length);
        for (const experiment of value) {
            t.string.write(stream, experiment.name);
            stream.writeBoolean(experiment.enabled);
        }
    },
    (stream) => {
        const toggles: ExperimentToggle[] = [];
        for (let i = 0, count = stream.readUnsignedIntLE(); i < count; i++) {
            toggles.push({ name: t.string.read(stream), enabled: stream.readBoolean() });
        }

        return toggles;
    }
);

/**
 * One network NBT compound, as the bytes it occupies.
 *
 * Parsed to find where it ends and then copied out, because the length of NBT is only known
 * by reading it. The network dialect - varint string lengths - is the one on the wire here.
 */
const networkNbt = t.custom<Buffer>(
    'NBT',
    (stream, value) => stream.write(value),
    (stream) => {
        const start = stream.getReadIndex();

        const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
        reader.setUseVarint(true);
        reader.parse();

        return Buffer.from(stream.getReadBuffer()!.subarray(start, stream.getReadIndex()));
    }
);

/** One `Block Property`: the block's name, then its definition as network NBT. */
const blockProperty = t.custom<BlockProperty>(
    'BlockProperty',
    (stream, value) => {
        t.string.write(stream, value.name);
        stream.write(value.definition);
    },
    (stream) => ({ name: t.string.read(stream), definition: networkNbt.read(stream) })
);

/** A uuid as the wire carries it: two 64 bit halves, little endian, most significant first. */
const wireUuid = t.custom<WireUUID>(
    'mce::UUID',
    (stream, value) => {
        stream.writeUnsignedLongLE(value.mostSignificantBits);
        stream.writeUnsignedLongLE(value.leastSignificantBits);
    },
    (stream) => ({
        mostSignificantBits: stream.readUnsignedLongLE(),
        leastSignificantBits: stream.readUnsignedLongLE()
    })
);

const writeOptional = <T>(stream: BinaryStream, value: T | undefined, write: (value: T) => void): void => {
    stream.writeBoolean(value !== undefined);
    if (value !== undefined) write(value);
};

const readOptional = <T>(stream: BinaryStream, read: () => T): T | undefined =>
    stream.readBoolean() ? read() : undefined;

/**
 * `Server Configuration Join Info`, presence byte included: `null` writes the single byte
 * saying there is none, and each of the three parts is optional behind its own byte.
 */
const serverJoinInformation = t.custom<ServerJoinInformation | null>(
    'optional<ServerJoinInformation>',
    (stream, join) => {
        stream.writeBoolean(join !== null);
        if (join === null) return;

        stream.writeBoolean(join.gathering !== undefined);
        if (join.gathering !== undefined) {
            const gathering = join.gathering;
            writeOptional(stream, gathering.experienceId, (id) => wireUuid.write(stream, id));
            writeOptional(stream, gathering.experienceName, (name) => t.string.write(stream, name));
            writeOptional(stream, gathering.worldId, (id) => wireUuid.write(stream, id));
            writeOptional(stream, gathering.worldName, (name) => t.string.write(stream, name));
            writeOptional(stream, gathering.creatorId, (id) => t.string.write(stream, id));
            writeOptional(stream, gathering.targetId, (id) => wireUuid.write(stream, id));
            writeOptional(stream, gathering.scenarioId, (id) => t.string.write(stream, id));
            writeOptional(stream, gathering.serverId, (id) => t.string.write(stream, id));
        }

        stream.writeBoolean(join.storeEntryPoint !== undefined);
        if (join.storeEntryPoint !== undefined) {
            t.string.write(stream, join.storeEntryPoint.storeId);
            t.string.write(stream, join.storeEntryPoint.storeName);
        }

        stream.writeBoolean(join.presence !== undefined);
        if (join.presence !== undefined) {
            writeOptional(stream, join.presence.richPresenceId, (id) => t.string.write(stream, id));
        }
    },
    (stream) => {
        if (!stream.readBoolean()) return null;

        const join: ServerJoinInformation = {};
        if (stream.readBoolean()) {
            const gathering: GatheringJoinInfo = {};
            gathering.experienceId = readOptional(stream, () => wireUuid.read(stream));
            gathering.experienceName = readOptional(stream, () => t.string.read(stream));
            gathering.worldId = readOptional(stream, () => wireUuid.read(stream));
            gathering.worldName = readOptional(stream, () => t.string.read(stream));
            gathering.creatorId = readOptional(stream, () => t.string.read(stream));
            gathering.targetId = readOptional(stream, () => wireUuid.read(stream));
            gathering.scenarioId = readOptional(stream, () => t.string.read(stream));
            gathering.serverId = readOptional(stream, () => t.string.read(stream));
            join.gathering = gathering;
        }

        if (stream.readBoolean()) {
            join.storeEntryPoint = { storeId: t.string.read(stream), storeName: t.string.read(stream) };
        }

        if (stream.readBoolean()) {
            join.presence = { richPresenceId: readOptional(stream, () => t.string.read(stream)) };
        }

        return join;
    }
);

/** `Edu Shared Uri Resource`: a button name and a link uri. */
const eduSharedUriResource = t.custom<{ buttonName: string; linkUri: string }>(
    'EducationSharedResourceUri',
    (stream, value) => {
        t.string.write(stream, value.buttonName);
        t.string.write(stream, value.linkUri);
    },
    (stream) => ({ buttonName: t.string.read(stream), linkUri: t.string.read(stream) })
);

/** The `StartGamePacket` field list; the module doc carries the wire provenance. */
export const startGamePacket = definePacket('StartGamePacket', {
    /** `Entity ID`: the player's own entity id, signed and stable for the session. */
    entityId: t.varint64,
    /** `Runtime ID`: the id everything on the wire refers to this player by. */
    runtimeEntityId: t.varuint64,
    /** `Game Type`. */
    gamemode: t.varint32,
    /** `Position`. */
    position: t.vec3,
    /** `Rotation` pitch. */
    pitch: t.lf32,
    /** `Rotation` yaw. */
    yaw: t.lf32,

    // LevelSettings, in wire order.
    /** `Seed`, a uint64; a negative seed travels as its two's complement bytes. */
    seed: t.lu64,
    /** Spawn Settings: `Spawn Biome Type`. */
    spawnBiomeType: t.li16,
    /** Spawn Settings: `User Defined Biome Name`. */
    userDefinedBiomeName: t.string,
    /** Spawn Settings: `Dimension`. */
    dimension: t.varint32,
    /** `Generator Type`. */
    generator: t.varint32,
    /** `Game Type`, the world default. */
    worldGamemode: t.varint32,
    /** `Is Hardcore`. */
    hardcore: t.bool,
    /** `Game Difficulty`. */
    difficulty: t.varint32,
    /** `Default Spawn Block Position`. Y included: an unsigned Y is wrong below zero. */
    spawnPosition: t.blockPos,
    /** `Achievements Disabled`. */
    achievementsDisabled: t.bool,
    /** `Editor World Type`. */
    editorWorldType: t.varint32,
    /** `Is Created In Editor`. */
    createdInEditor: t.bool,
    /** `Is Exported From Editor`. */
    exportedFromEditor: t.bool,
    /** `Editor Level Migration Version`: which editor migrations the world has had; 2225 on. */
    editorLevelMigrationVersion: gated<number>(SINCE_2225, t.int8, 0),
    /** `Day Cycle Stop Time`. */
    dayCycleStopTime: t.varint32,
    /** `Education Edition Offer`. */
    educationEditionOffer: t.varuint32,
    /** `Education Features Enabled`. */
    educationFeaturesEnabled: t.bool,
    /** `Education Product ID`. */
    educationProductId: t.string,
    /** `Rain Level`. */
    rainLevel: t.lf32,
    /** `Lightning Level`. */
    lightningLevel: t.lf32,
    /** `Has Confirmed Platform Locked Content`. */
    confirmedPlatformLockedContent: t.bool,
    /** `Multiplayer Game Intent`. */
    multiplayerGame: t.bool,
    /** `LAN Broadcast Intent`. */
    lanBroadcast: t.bool,
    /** `Xbox Live Broadcast Setting`. */
    xboxLiveBroadcastSetting: t.varint32,
    /** `Platform Broadcast Setting`. */
    platformBroadcastSetting: t.varint32,
    /** `Commands Enabled`. */
    commandsEnabled: t.bool,
    /** `Texture Packs Required`. */
    texturePacksRequired: t.bool,
    /** `Rule Data`. */
    gameRules: t.list(gameRule),
    /** `Experiments`. */
    experiments,
    /** `ExperimentsEverToggled`. */
    experimentsEverToggled: t.bool,
    /** `Has Bonus Chest Enabled`. */
    bonusChestEnabled: t.bool,
    /** `Start With Map Enabled`. */
    startWithMapEnabled: t.bool,
    /** `Player Permissions`. One plain byte, not a varint. */
    playerPermissions: t.int8,
    /** `Server Chunk Tick Range`. */
    serverChunkTickRange: t.li32,
    /** `Has Locked Behavior Pack`. */
    hasLockedBehaviorPack: t.bool,
    /** `Has Locked Resource Pack`. */
    hasLockedResourcePack: t.bool,
    /** `Is From Locked Template`. */
    isFromLockedTemplate: t.bool,
    /** `Use Msa Gamertags Only`. */
    useMsaGamertagsOnly: t.bool,
    /** `Is From World Template`. */
    isFromWorldTemplate: t.bool,
    /** `Is World Template Option Locked`. */
    isWorldTemplateOptionLocked: t.bool,
    /** `Only Spawn V1 Villagers`. */
    onlySpawnV1Villagers: t.bool,
    /** `Persona Disabled`. */
    personaDisabled: t.bool,
    /** `Custom Skins Disabled`. */
    customSkinsDisabled: t.bool,
    /** `Emote Chat Muted`. */
    emoteChatMuted: t.bool,
    /** `Base Game Version`. */
    baseGameVersion: t.string,
    /** `Limited World Width`; only the Legacy generator reads it, a BDS sends 16. */
    limitedWorldWidth: t.li32,
    /** `Limited World Depth`. */
    limitedWorldDepth: t.li32,
    /** `Nether Type`. */
    newNether: t.bool,
    /** `Edu Shared Uri Resource`. */
    eduSharedUriResource,
    /** `Override Force Experimental Gameplay`; absent means the world's own setting stands. */
    forceExperimentalGameplay: t.optional(t.bool),
    /** `Chat Restriction Level`. */
    chatRestrictionLevel: t.uint8,
    /** `Disable Player Interactions`. */
    disablePlayerInteractions: t.bool,
    /** `Server Editor Connection Policy`. */
    serverEditorConnectionPolicy: t.varint32,
    /** `Allow Anonymous Block Drops In Editor Worlds`. End of LevelSettings. */
    allowAnonymousBlockDropsInEditorWorlds: t.bool,

    /** `Level ID`. */
    levelId: t.string,
    /** `Level Name`. */
    levelName: t.string,
    /** `Template Content Identity`. */
    templateContentIdentity: t.string,
    /** `Is Trial`. */
    isTrial: t.bool,
    /** Movement Settings: `Rewind History Size`. */
    rewindHistorySize: t.varint32,
    /** Movement Settings: `Server Authoritative Block Breaking`. */
    serverAuthoritativeBlockBreaking: t.bool,
    /** `Level Current Time`. */
    currentTick: t.lu64,
    /** `Enchantment Seed`. */
    enchantmentSeed: t.varint32,
    /** `Block Properties`: every block the client does not have built in. */
    blockProperties: t.list(blockProperty),
    /** `Multiplayer Correlation Id`. */
    multiplayerCorrelationId: t.string,
    /** `Enable Item Stack Net Manager`. */
    enableItemStackNetManager: t.bool,
    /** `Server Version`. */
    serverVersion: t.string,
    /** `Player Property Data`, network NBT handed on as bytes. */
    playerPropertyData: networkNbt,
    /** `Server Block Type Registry Checksum`. */
    blockRegistryChecksum: t.lu64,
    /** `World Template ID`; nil says the world was not made from a template. */
    worldTemplateId: wireUuid,
    /** `Server Enabled ClientSide Generation`. */
    clientSideGeneration: t.bool,
    /** `BlockNetworkIds Are Hashes`. */
    blockNetworkIdsAreHashes: t.bool,
    /** `NetworkPermissions`: Server Auth Sound Enabled. */
    serverAuthoritativeSound: t.bool,
    /** `Server Configuration Join Info`. */
    serverJoinInformation,
    /** Server Telemetry Data: `Server Id`. */
    serverId: t.string,
    /** Server Telemetry Data: `Scenario Id`. */
    scenarioId: t.string,
    /** Server Telemetry Data: `World Id`. */
    worldId: t.string,
    /** Server Telemetry Data: `Owner Id`. */
    ownerId: t.string
});

/** What `StartGamePacket` carries, at every version; derived from the field list. */
export type StartGamePayload = PayloadOf<typeof startGamePacket>;
