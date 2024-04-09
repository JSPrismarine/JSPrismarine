import type SpawnSettings from './SpawnSettings';
import { BlockPos, Experiments, NetworkBinaryStream, NetworkStructure } from '../';
import type { Difficulty, PlayerPermissionLevel } from '@jsprismarine/minecraft';
import { Gamemode, Generator} from '@jsprismarine/minecraft';

export enum EditorWorldType {
    NON_EDITOR,
    EDITOR_PROJECT,
    EDITOR_TEST_LEVEL
}

export enum EducationEditionOffer {
    NONE,
    REST_OF_WORLD,
    CHINA_DEPRECATED
}

export enum SocialGamePublishSettings {
    NO_MULTI_PLAY,
    INVITE_ONLY,
    FRIENDS_ONLY,
    PUBLIC
}

export enum ChatRestrictionLevel {
    NONE,
    DROPPED,
    DISABLED
}

interface EduSharedUriResource {
    buttonName: string;
    linkUri: string;
}

interface LevelSettingsConfig {
    gamemode?: number;
    baseGameVersion?: string;
    generator?: Generator;
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
    forceOverrideExperimentalGameplay?: boolean;
    chatRestrictionLevel?: ChatRestrictionLevel;
    disablePlayerInteractions?: boolean;
    bonusChestEnabled?: boolean;
    startWithMapEnabled?: boolean;
    experiments?: Experiments;
}

/**
 * Represents the network structure of the settings of a level.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/LevelSettings.html}
 */
export default class LevelSettings extends NetworkStructure {
    private readonly gamemode: Gamemode.Gametype;
    private readonly generator: Generator;
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
    private readonly forceOverrideExperimentalGameplay: boolean;
    private readonly chatRestrictionLevel: ChatRestrictionLevel;
    private readonly disablePlayerInteractions: boolean;
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
        private readonly gamerules: Set<{}>,
        private readonly playerPermissions: PlayerPermissionLevel,
        config: LevelSettingsConfig = {}
    ) {
        super();
        this.gamemode = config.gamemode ?? Gamemode.Gametype.WORLD_DEFAULT;
        this.baseGameVersion = config.baseGameVersion ?? '*';
        this.generator = config.generator ?? Generator.OVERWORLD;
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
        this.forceOverrideExperimentalGameplay = config.forceOverrideExperimentalGameplay ?? false;
        this.chatRestrictionLevel = config.chatRestrictionLevel ?? ChatRestrictionLevel.NONE;
        this.disablePlayerInteractions = config.disablePlayerInteractions ?? false;
        this.bonusChestEnabled = config.bonusChestEnabled ?? false;
        this.startWithMapEnabled = config.startWithMapEnabled ?? false;
        this.experiments = config.experiments ?? new Experiments();
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeLongLE(this.seed);
        this.spawnSettings.serialize(stream);
        stream.writeVarInt(this.generator);
        stream.writeVarInt(this.gamemode);
        stream.writeVarInt(this.difficulty);
        this.defaultSpawnPos.serialize(stream);
        stream.writeBoolean(this.achievementsDisabled);
        stream.writeVarInt(this.editorWorldType);
        stream.writeBoolean(this.createdInEditor);
        stream.writeBoolean(this.exportedFromEditor);
        stream.writeVarInt(this.dayCycleStopTime);
        stream.writeVarInt(this.eduEditionOffer);
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
        // TODO: Implement gamerule class & serialization
        stream.writeUnsignedVarInt(this.gamerules.size);
        this.experiments.serialize(stream);
        stream.writeBoolean(this.bonusChestEnabled);
        stream.writeBoolean(this.startWithMapEnabled);
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
        stream.writeBoolean(this.forceOverrideExperimentalGameplay);
        stream.writeByte(this.chatRestrictionLevel);
        stream.writeBoolean(this.disablePlayerInteractions);
    }

    public deserialize(stream: NetworkBinaryStream): void {
        void stream;
        throw new Error('Method not implemented.');
    }
}
