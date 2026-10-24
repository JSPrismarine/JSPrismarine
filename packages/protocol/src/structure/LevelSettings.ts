import type { Difficulty, PlayerPermissionLevel } from '@jsprismarine/minecraft';
import { Gametype, Generator } from '@jsprismarine/minecraft';
import type { BlockPos, NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';
import { GameRuleType } from '../packet/StartGamePacket';
import type { EduSharedUriResourceData as EduSharedUriResource } from './EduSharedUriResource';
import Experiments from './Experiments';
import type SpawnSettings from './SpawnSettings';

import type { GameRule } from '../packet/StartGamePacket';

/** The docs' EditorWorldType: what kind of editor world, if any, the level is. */
export enum EditorWorldType {
    NON_EDITOR = 0,
    EDITOR_PROJECT = 1,
    EDITOR_TEST_LEVEL = 2,
    EDITOR_REALMS_UPLOAD = 3
}

/** The docs' EducationEditionOffer. */
export enum EducationEditionOffer {
    NONE = 0,
    REST_OF_WORLD = 1,
    CHINA_DEPRECATED = 2
}

/** The docs' GamePublishSetting: who a broadcast of the world is visible to. */
export enum SocialGamePublishSettings {
    NO_MULTI_PLAY = 0,
    INVITE_ONLY = 1,
    FRIENDS_ONLY = 2,
    FRIENDS_OF_FRIENDS = 3,
    PUBLIC = 4
}

/** The docs' ChatRestrictionLevel. */
export enum ChatRestrictionLevel {
    NONE = 0,
    DROPPED = 1,
    DISABLED = 2
}

/** The docs' ServerEditorConnectionPolicy: which clients an editor server lets in. */
export enum ServerEditorConnectionPolicy {
    MATCH_WORLD_TYPE = 0,
    EDITOR_ONLY = 1,
    VANILLA_ONLY = 2,
    MIXED = 3
}

interface LevelSettingsConfig {
    gamemode?: number;
    baseGameVersion?: string;
    generator?: Generator;
    hardcore?: boolean;
    achievementsDisabled?: boolean;
    editorWorldType?: EditorWorldType;
    createdInEditor?: boolean;
    exportedFromEditor?: boolean;
    eduEditionOffer?: EducationEditionOffer;
    eduFeaturesEnabled?: boolean;
    eduProductId?: string;
    confirmedPlatformLockedContent?: boolean;
    xblBroadcastSettings?: SocialGamePublishSettings;
    platformBroadcastSettings?: SocialGamePublishSettings;
    texturePacksRequired?: boolean;
    serverChunkTickRange?: number;
    lockedBehaviorPack?: boolean;
    lockedResourcePack?: boolean;
    fromLockedWorldTemplate?: boolean;
    onlyMsaGamertags?: boolean;
    onlySpawningV1Villagers?: boolean;
    personaDisabled?: boolean;
    customSkinDisabled?: boolean;
    emoteChatMuted?: boolean;
    limitedWorldWidth?: number;
    limitedWorldDepth?: number;
    newNether?: boolean;
    eduSharedUriResource?: EduSharedUriResource;
    /** Optional on the wire. Leave it undefined to send no override, which is what BDS does. */
    forceOverrideExperimentalGameplay?: boolean;
    chatRestrictionLevel?: ChatRestrictionLevel;
    disablePlayerInteractions?: boolean;
    serverEditorConnectionPolicy?: ServerEditorConnectionPolicy;
    allowAnonymousBlockDropsInEditorWorlds?: boolean;
    bonusChestEnabled?: boolean;
    startWithMapEnabled?: boolean;
    experiments?: Experiments;
}

/**
 * The settings of a level, as StartGamePacket (field 5) carries them.
 *
 * Protocol 2193 wire order, with the docs' field names:
 * 0. Seed: uint64 LE.
 * 1. Spawn Settings: {@link SpawnSettings}.
 * 2. Generator Type: varint32.
 * 3. Game Type: varint32.
 * 4. Is Hardcore: boolean.
 * 5. Game Difficulty: varint32.
 * 6. Default Spawn Block Position: {@link BlockPos}, three varint32.
 * 7. Achievements Disabled: boolean.
 * 8. Editor World Type: varint32.
 * 9. Is Created In Editor, 10. Is Exported From Editor: boolean each.
 * 11. Day Cycle Stop Time: varint32.
 * 12. Education Edition Offer: varuint32.
 * 13. Education Features Enabled: boolean. 14. Education Product ID: string.
 * 15. Rain Level, 16. Lightning Level: float LE each.
 * 17. Has Confirmed Platform Locked Content, 18. Multiplayer Game Intent,
 *     19. LAN Broadcast Intent: boolean each.
 * 20. Xbox Live Broadcast Setting, 21. Platform Broadcast Setting: varint32 each.
 * 22. Commands Enabled, 23. Texture Packs Required: boolean each.
 * 24. Rule Data: varuint count, then per rule a Rule Name string, a Rule Can Be Modified
 *     boolean, a varuint variant selector (0 none, 1 boolean, 2 int32 LE, 3 float LE) and the
 *     value, which is absent for variant 0.
 * 25. Experiments: {@link Experiments}.
 * 26. Has Bonus Chest Enabled, 27. Start With Map Enabled: boolean each.
 * 28. Player Permissions: one byte.
 * 29. Server Chunk Tick Range: int32 LE.
 * 30. Has Locked Behavior Pack through 39. Emote Chat Muted: ten booleans.
 * 40. Base Game Version: string.
 * 41. Limited World Width, 42. Limited World Depth: int32 LE each.
 * 43. Nether Type: boolean.
 * 44. Edu Shared Uri Resource: Button Name string, Link Uri string.
 * 45. Override Force Experimental Gameplay: optional boolean, a presence byte and then the
 *     value only when present.
 * 46. Chat Restriction Level: uint8.
 * 47. Disable Player Interactions: boolean.
 * 48. Server Editor Connection Policy: varint32.
 * 49. Allow Anonymous Block Drops In Editor Worlds: boolean.
 *
 * Multiplayer Game Intent and LAN Broadcast Intent are always written as true, and Is From
 * World Template and Is World Template Option Locked always as false. Decoding is not
 * implemented here: the client reads StartGame through StartGamePacket, which inlines this
 * layout.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.50/types/level-settings/}
 */
export default class LevelSettings extends NetworkStructure {
    private readonly gamemode: Gametype;
    private readonly generator: Generator;
    private readonly hardcore: boolean;
    private readonly achievementsDisabled: boolean;
    private readonly editorWorldType: EditorWorldType;
    private readonly createdInEditor: boolean;
    private readonly exportedFromEditor: boolean;
    private readonly eduEditionOffer: EducationEditionOffer;
    private readonly eduFeaturesEnabled: boolean;
    private readonly eduProductId: string;
    private readonly confirmedPlatformLockedContent: boolean;
    private readonly multiplayerGame = true;
    private readonly broadcastToLAN = true;
    private readonly xblBroadcastSettings: SocialGamePublishSettings;
    private readonly platformBroadcastSettings: SocialGamePublishSettings;
    private readonly texturePacksRequired: boolean;
    private readonly serverChunkTickRange: number;
    private readonly lockedBehaviorPack: boolean;
    private readonly lockedResourcePack: boolean;
    private readonly fromLockedWorldTemplate: boolean;
    private readonly onlyMsaGamertags: boolean;
    private readonly createdFromWorldTemplate = false;
    private readonly worldTemplateOptionLocked = false;
    private readonly onlySpawningV1Villagers: boolean;
    private readonly personaDisabled: boolean;
    private readonly customSkinDisabled: boolean;
    private readonly emoteChatMuted: boolean;
    private readonly baseGameVersion: string;
    private readonly limitedWorldWidth: number;
    private readonly limitedWorldDepth: number;
    private readonly newNether: boolean;
    private readonly eduSharedUriResource: EduSharedUriResource;
    private readonly forceOverrideExperimentalGameplay: boolean | undefined;
    private readonly chatRestrictionLevel: ChatRestrictionLevel;
    private readonly disablePlayerInteractions: boolean;
    private readonly serverEditorConnectionPolicy: ServerEditorConnectionPolicy;
    private readonly allowAnonymousBlockDropsInEditorWorlds: boolean;
    private readonly bonusChestEnabled: boolean;
    private readonly startWithMapEnabled: boolean;
    private readonly experiments: Experiments;

    public constructor(
        private readonly seed: bigint,
        private readonly spawnSettings: SpawnSettings,
        private difficulty: Difficulty,
        private defaultSpawnPos: BlockPos,
        private dayCycleStopTime: number,
        private rainLevel: number,
        private lightningLevel: number,
        private readonly commandsEnabled: boolean,
        private readonly gameRules: readonly GameRule[],
        private readonly playerPermissions: PlayerPermissionLevel,
        config: LevelSettingsConfig = {}
    ) {
        super();
        this.gamemode = config.gamemode ?? Gametype.WORLD_DEFAULT;
        this.baseGameVersion = config.baseGameVersion ?? '*';
        this.generator = config.generator ?? Generator.OVERWORLD;
        this.hardcore = config.hardcore ?? false;
        this.achievementsDisabled = config.achievementsDisabled ?? false;
        this.editorWorldType = config.editorWorldType ?? EditorWorldType.NON_EDITOR;
        this.createdInEditor = config.createdInEditor ?? false;
        this.exportedFromEditor = config.exportedFromEditor ?? false;
        this.eduEditionOffer = config.eduEditionOffer ?? EducationEditionOffer.NONE;
        this.eduFeaturesEnabled = config.eduFeaturesEnabled ?? false;
        this.eduProductId = config.eduProductId ?? '';
        this.confirmedPlatformLockedContent = config.confirmedPlatformLockedContent ?? false;
        this.xblBroadcastSettings = config.xblBroadcastSettings ?? SocialGamePublishSettings.PUBLIC;
        this.platformBroadcastSettings = config.platformBroadcastSettings ?? SocialGamePublishSettings.PUBLIC;
        this.texturePacksRequired = config.texturePacksRequired ?? false;
        this.serverChunkTickRange = config.serverChunkTickRange ?? 4;
        this.lockedBehaviorPack = config.lockedBehaviorPack ?? false;
        this.lockedResourcePack = config.lockedResourcePack ?? false;
        this.fromLockedWorldTemplate = config.fromLockedWorldTemplate ?? false;
        this.onlyMsaGamertags = config.onlyMsaGamertags ?? false;
        this.onlySpawningV1Villagers = config.onlySpawningV1Villagers ?? false;
        this.personaDisabled = config.personaDisabled ?? false;
        this.customSkinDisabled = config.customSkinDisabled ?? false;
        this.emoteChatMuted = config.emoteChatMuted ?? false;
        this.limitedWorldWidth = config.limitedWorldWidth ?? 0;
        this.limitedWorldDepth = config.limitedWorldDepth ?? 0;
        this.newNether = config.newNether ?? true;
        this.eduSharedUriResource = config.eduSharedUriResource ?? { buttonName: '', linkUri: '' };
        this.forceOverrideExperimentalGameplay = config.forceOverrideExperimentalGameplay;
        this.chatRestrictionLevel = config.chatRestrictionLevel ?? ChatRestrictionLevel.NONE;
        this.disablePlayerInteractions = config.disablePlayerInteractions ?? false;
        this.serverEditorConnectionPolicy =
            config.serverEditorConnectionPolicy ?? ServerEditorConnectionPolicy.MATCH_WORLD_TYPE;
        this.allowAnonymousBlockDropsInEditorWorlds = config.allowAnonymousBlockDropsInEditorWorlds ?? false;
        this.bonusChestEnabled = config.bonusChestEnabled ?? false;
        this.startWithMapEnabled = config.startWithMapEnabled ?? false;
        this.experiments = config.experiments ?? new Experiments();
    }

    public serialize(stream: NetworkBinaryStream): void {
        // The seed is a uint64, and a real server's seed can sit above the signed range.
        stream.writeUnsignedLongLE(this.seed);
        this.spawnSettings.serialize(stream);
        stream.writeVarInt(this.generator);
        stream.writeVarInt(this.gamemode);
        stream.writeBoolean(this.hardcore);
        stream.writeVarInt(this.difficulty);
        this.defaultSpawnPos.serialize(stream);
        stream.writeBoolean(this.achievementsDisabled);
        stream.writeVarInt(this.editorWorldType);
        stream.writeBoolean(this.createdInEditor);
        stream.writeBoolean(this.exportedFromEditor);
        stream.writeVarInt(this.dayCycleStopTime);
        stream.writeUnsignedVarInt(this.eduEditionOffer);
        stream.writeBoolean(this.eduFeaturesEnabled);
        stream.writeString(this.eduProductId);
        stream.writeFloatLE(this.rainLevel);
        stream.writeFloatLE(this.lightningLevel);
        stream.writeBoolean(this.confirmedPlatformLockedContent);
        stream.writeBoolean(this.multiplayerGame);
        stream.writeBoolean(this.broadcastToLAN);
        stream.writeVarInt(this.xblBroadcastSettings);
        stream.writeVarInt(this.platformBroadcastSettings);
        stream.writeBoolean(this.commandsEnabled);
        stream.writeBoolean(this.texturePacksRequired);

        stream.writeUnsignedVarInt(this.gameRules.length);
        for (const rule of this.gameRules) {
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

        this.experiments.serialize(stream);
        stream.writeBoolean(this.bonusChestEnabled);
        stream.writeBoolean(this.startWithMapEnabled);
        // The docs mark Player Permissions as a varint int8, but BDS 1.26.51 sends Member as
        // the single byte 0x01, so this stays one plain byte.
        stream.writeByte(this.playerPermissions);
        stream.writeIntLE(this.serverChunkTickRange);
        stream.writeBoolean(this.lockedBehaviorPack);
        stream.writeBoolean(this.lockedResourcePack);
        stream.writeBoolean(this.fromLockedWorldTemplate);
        stream.writeBoolean(this.onlyMsaGamertags);
        stream.writeBoolean(this.createdFromWorldTemplate);
        stream.writeBoolean(this.worldTemplateOptionLocked);
        stream.writeBoolean(this.onlySpawningV1Villagers);
        stream.writeBoolean(this.personaDisabled);
        stream.writeBoolean(this.customSkinDisabled);
        stream.writeBoolean(this.emoteChatMuted);
        stream.writeString(this.baseGameVersion);
        stream.writeIntLE(this.limitedWorldWidth);
        stream.writeIntLE(this.limitedWorldDepth);
        stream.writeBoolean(this.newNether);
        stream.writeString(this.eduSharedUriResource.buttonName);
        stream.writeString(this.eduSharedUriResource.linkUri);

        stream.writeBoolean(this.forceOverrideExperimentalGameplay !== undefined);
        if (this.forceOverrideExperimentalGameplay !== undefined) {
            stream.writeBoolean(this.forceOverrideExperimentalGameplay);
        }

        stream.writeByte(this.chatRestrictionLevel);
        stream.writeBoolean(this.disablePlayerInteractions);
        stream.writeVarInt(this.serverEditorConnectionPolicy);
        stream.writeBoolean(this.allowAnonymousBlockDropsInEditorWorlds);
    }

    /**
     * Not implemented. The client decodes StartGame, and this structure with it, through
     * StartGamePacket.
     * @throws Always.
     */
    public deserialize(stream: NetworkBinaryStream): void {
        void stream;
        throw new Error('LevelSettings.deserialize is not implemented; decode StartGamePacket instead.');
    }
}
