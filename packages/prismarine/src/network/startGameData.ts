import { block_definitions } from '@jsprismarine/bedrock-data';
import { bedrockDimensionOverlay } from '@jsprismarine/mapping';
import type { Vector3 } from '@jsprismarine/math';
import { Generator, getGametypeId } from '@jsprismarine/minecraft';
import {
    EditorLevelMigrationVersion,
    EMPTY_COMPOUND,
    GameRuleType
} from '@jsprismarine/protocol/packet/StartGamePacket';
import { writeNetworkNbt } from '@jsprismarine/protocol/payload';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';

import type { BlockProperty, GameRule, StartGame } from '@jsprismarine/protocol/packet/StartGamePacket';
import type Player from '../Player';
import type Server from '../Server';
import { BlockStateSchemas } from '../block/state/BlockStateSchema';
import { eyePositionAt } from '../entity/Human';
import type { World } from '../world/World';
import { isFlatGenerator } from '../world/WorldPersistence';

/** The server-owned state needed to produce a Protocol `StartGame` payload. */
export interface StartGameDataOptions {
    /** The server and its selected game settings. */
    readonly server: Server;
    /** The joining player. */
    readonly player: Player;
    /** The world the player is joining. */
    readonly world: World;
    /** Spawn position returned by the world. */
    readonly worldSpawnPosition: Vector3;
    /** Newest Minecraft version reported by the negotiated protocol codec. */
    readonly serverVersion: string;
    /** Content-built declarations; omitted when the captured manager data is used. */
    readonly blockProperties?: readonly BlockProperty[];
}

/**
 * Builds the server's join state as the protocol package's `StartGame` data shape.
 *
 * The server supplies player, world, settings, and block definitions. Protocol owns the
 * packet class and writes this data using the negotiated connection context.
 */
export const createStartGameData = ({
    server,
    player,
    world,
    worldSpawnPosition,
    serverVersion,
    blockProperties
}: StartGameDataOptions): StartGame => {
    const joinSpawn = player.getJoinSpawn();
    const position = joinSpawn ? eyePositionAt(joinSpawn.requested) : player.getPosition();
    const gameRules: GameRule[] = [...world.getGameRuleManager().getGameRules()].map(([name, [value, editable]]) => {
        if (typeof value === 'boolean') return { name, editable, type: GameRuleType.BOOL, value };
        if (Number.isInteger(value)) return { name, editable, type: GameRuleType.INT, value };
        return { name, editable, type: GameRuleType.FLOAT, value };
    });

    return {
        entityId: player.getRuntimeId(),
        runtimeEntityId: player.getRuntimeId(),
        gamemode: player.gamemode,
        position: { x: position.getX(), y: position.getY(), z: position.getZ() },
        pitch: player.pitch,
        yaw: player.yaw,
        seed: BigInt.asUintN(64, world.getSeed()),
        spawnBiomeType: 0,
        userDefinedBiomeName: 'minecraft:plains',
        dimension: world.getDimension().bedrockId,
        generator: startGameGenerator(world),
        worldGamemode: getGametypeId(server.getConfig().getGamemode()),
        hardcore: false,
        difficulty: server.getConfig().getDifficulty(),
        spawnPosition: {
            x: worldSpawnPosition.getX(),
            y: worldSpawnPosition.getY(),
            z: worldSpawnPosition.getZ()
        },
        achievementsDisabled: true,
        editorWorldType: 0,
        createdInEditor: false,
        exportedFromEditor: false,
        editorLevelMigrationVersion: EditorLevelMigrationVersion.Legacy,
        dayCycleStopTime: world.getTicks(),
        educationEditionOffer: 0,
        educationFeaturesEnabled: false,
        educationProductId: '',
        rainLevel: 0,
        lightningLevel: 0,
        confirmedPlatformLockedContent: false,
        multiplayerGame: true,
        lanBroadcast: true,
        xboxLiveBroadcastSetting: 4,
        platformBroadcastSetting: 4,
        commandsEnabled: true,
        texturePacksRequired: false,
        gameRules,
        experiments: [],
        experimentsEverToggled: false,
        bonusChestEnabled: false,
        startWithMapEnabled: false,
        playerPermissions: 1,
        serverChunkTickRange: 4,
        hasLockedBehaviorPack: false,
        hasLockedResourcePack: false,
        isFromLockedTemplate: false,
        useMsaGamertagsOnly: false,
        isFromWorldTemplate: false,
        isWorldTemplateOptionLocked: false,
        onlySpawnV1Villagers: false,
        personaDisabled: false,
        customSkinsDisabled: false,
        emoteChatMuted: false,
        baseGameVersion: '*',
        limitedWorldWidth: 16,
        limitedWorldDepth: 16,
        newNether: false,
        eduSharedUriResource: { buttonName: '', linkUri: '' },
        chatRestrictionLevel: 0,
        disablePlayerInteractions: false,
        serverEditorConnectionPolicy: 0,
        allowAnonymousBlockDropsInEditorWorlds: false,
        levelId: world.getUUID(),
        levelName: world.getName(),
        templateContentIdentity: '00000000-0000-0000-0000-000000000000',
        isTrial: false,
        rewindHistorySize: 0,
        serverAuthoritativeBlockBreaking: server.getConfig().getServerAuthoritativeBlockBreaking(),
        currentTick: BigInt(server.getTick()),
        enchantmentSeed: 0,
        blockProperties: [...(blockProperties ?? managerBlockProperties())],
        multiplayerCorrelationId: '',
        enableItemStackNetManager: true,
        serverVersion,
        playerPropertyData: EMPTY_COMPOUND,
        blockRegistryChecksum: 0n,
        worldTemplateId: { mostSignificantBits: 0n, leastSignificantBits: 0n },
        clientSideGeneration: false,
        blockNetworkIdsAreHashes: true,
        serverAuthoritativeSound: false,
        serverJoinInformation: {},
        serverId: 'JSPrismarine',
        scenarioId: 'JSPrismarine',
        worldId: world.getName(),
        ownerId: ''
    };
};

/**
 * The `Generator` value `StartGame` carries, read from the level's Overworld stem.
 *
 * The field describes the world type, not the dimension the player joins in: a player joining
 * in the Nether is sent the Overworld stem's value, and `dimension` carries the join dimension.
 * The rule is the one the client tells apart: a `minecraft:flat` stem is `FLAT`, and every
 * other generator kind is the stem type's overlay value, `OVERWORLD` for the vanilla type. A
 * level with no Overworld stem reads its join world's stem the same way.
 */
export const startGameGenerator = (world: World): Generator => {
    const stem = world.getLevel().getStems().get(OVERWORLD_STEM_ID) ?? world.getStem();
    if (isFlatGenerator(stem.generator)) return Generator.FLAT;
    return bedrockDimensionOverlay(stem.type)?.generatorType ?? Generator.OVERWORLD;
};

/** Captured vanilla definitions and registered plugin schemas for the no-content fallback. */
const managerBlockProperties = (): BlockProperty[] => [
    ...block_definitions,
    ...BlockStateSchemas.getCustomSchemas().map((schema) => ({
        name: schema.name,
        definition: writeNetworkNbt(schema.getDefaultState().toNBT(schema.getPropertyTypes()))
    }))
];
