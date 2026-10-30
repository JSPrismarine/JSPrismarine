import { block_definitions } from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { Difficulty, Dimension, Generator } from '@jsprismarine/minecraft';
import { ByteOrder, NBTTagCompound, NBTWriter } from '@jsprismarine/nbt';
import { GameRuleType, layoutAt, startGamePacket } from '@jsprismarine/protocol';
import { BlockStateSchemas } from '../../block/state/BlockStateSchema';
import GameRuleManager, { toNetworkGameRule } from '../../world/GameRuleManager';
import { minecraftVersions as versions2193, protocolVersion as protocol2193 } from '../codec/v2193';
import { minecraftVersions as versions2225, protocolVersion as protocol2225 } from '../codec/v2225';
import DataPacket from './DataPacket';
import { GameRuleValueType } from '../type/GameRule';

import type { BlockProperty, StartGamePayload, GameRule as WireGameRule } from '@jsprismarine/protocol';
import type { GameRule } from '../type/GameRule';

/**
 * The docs' `EditorLevelMigrationVersion`: which editor level migrations a world has had
 * applied. Protocol 2225 values, from the v1.26.60 `metadata.zip` schema.
 */
export enum EditorLevelMigrationVersion {
    Legacy = 0,
    EditorAchievements = 1
}

/** The newest game version per protocol, for the packet's `Server Version` string. */
const VERSIONS_BY_PROTOCOL: ReadonlyMap<number, readonly string[]> = new Map([
    [protocol2193, versions2193],
    [protocol2225, versions2225]
]);

/** An empty network NBT compound as bytes, the `Player Property Data` this server sends. */
const emptyCompound = (): Buffer => {
    const stream = new BinaryStream();
    const nbt = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
    nbt.setUseVarint(true);
    nbt.writeCompound(new NBTTagCompound());
    return stream.getBuffer();
};

/** A prismarine {@link GameRule} as the wire shape the protocol definition carries. */
const toWireGameRule = (rule: GameRule): WireGameRule => ({
    name: rule.ruleName,
    editable: rule.ruleCanBeModified,
    type: rule.ruleValue.type,
    value: 'value' in rule.ruleValue ? rule.ruleValue.value : false
});

/** The mirror of {@link toWireGameRule}, back into the tagged prismarine shape. */
const fromWireGameRule = (rule: WireGameRule): GameRule => {
    const ruleValue: GameRule['ruleValue'] =
        rule.type === GameRuleType.BOOL
            ? { type: GameRuleValueType.Boolean, value: Boolean(rule.value) }
            : rule.type === GameRuleType.INT
              ? { type: GameRuleValueType.Integer, value: Number(rule.value) }
              : rule.type === GameRuleType.FLOAT
                ? { type: GameRuleValueType.Float, value: Number(rule.value) }
                : { type: GameRuleValueType.Null };
    return { ruleName: rule.name, ruleCanBeModified: rule.editable, ruleValue };
};

/**
 * Tells a joining client who it is, where it is, and what world it is in.
 *
 * **Bound To:** Client
 *
 * The wire layout lives in `@jsprismarine/protocol`'s declarative `startGamePacket`
 * definition, which this class walks at the protocol version stamped on it: the full 2193
 * field list, plus the `Editor Level Migration Version` int8 inserted mid-list from 2225 on.
 * This class keeps the server's opinionated surface - a handful of settable fields - and
 * fills the rest of the payload with the values a Bedrock Dedicated Server sends; the
 * definition's field docs carry the wire provenance.
 */
export default class StartGamePacket extends DataPacket {
    public entityId!: bigint;
    public runtimeEntityId!: bigint;
    public gamemode!: number;
    public defaultGamemode: number = 0;

    /** Game Difficulty, which the client shows on its own pause screen. */
    public difficulty: Difficulty = Difficulty.NORMAL;

    /**
     * Generator Type of the world. A dedicated server sends `Flat` for a flat world and
     * `Overworld` for a generated one; the client reads it for its horizon and fog.
     */
    public generator: Generator = Generator.OVERWORLD;

    /** Dimension the player spawns in, from the world's own definition. */
    public dimension: Dimension = Dimension.OVERWORLD;

    public playerPos: Vector3 = new Vector3(0, 5, 0);
    public pitch: number = 0;
    public yaw: number = 0;

    public serverIdentifier!: string;
    public worldIdentifier!: string;
    public scenarioIdentifier!: string;
    public levelId!: string;
    public worldName!: string;
    /** The world seed, which the wire carries as a uint64 and the client shows as it is. */
    public seed!: bigint;
    public time: number = 0;
    public ticks: number = 0;

    /**
     * `Server Authoritative Block Breaking`: whether the server times block breaking. On, as a
     * Bedrock Dedicated Server sends it, the client reports a break it predicts as
     * `PREDICT_DESTROY_BLOCK` inside `PlayerAuthInput` and the server animates the cracks. Off,
     * the client breaks the block itself and reports it with an `InventoryTransaction`.
     */
    public serverAuthoritativeBlockBreaking = true;

    public worldSpawnPos!: Vector3;

    /**
     * `Rule Data`: the world's rules when the server builds the packet, the rules as the wire
     * carried them when the packet was decoded, or null to send none.
     */
    public gameRules: GameRuleManager | readonly GameRule[] | null = null;

    /**
     * `Block Properties`, or null to send the captured vanilla definitions
     * plus whatever schemas plugins registered.
     *
     * Set from the content registries when the content build is on, which is
     * the only way a block that build invented reaches the client: with
     * hashed runtime ids a block the client was never told about has a
     * number it cannot resolve.
     */
    public blockProperties: readonly BlockProperty[] | null = null;

    /** Editor Level Migration Version, from 2225 on; earlier versions never put it on the wire. */
    public editorLevelMigrationVersion: number = EditorLevelMigrationVersion.Legacy;

    /** Writes the full payload at the stamped protocol version, in layout order. */
    public encodePayload(): void {
        layoutAt(startGamePacket, this.codecProtocol).encode(this, this.buildPayload());
    }

    /**
     * The full payload: this class's fields where it has one, and the value a Bedrock
     * Dedicated Server sends everywhere else. The field-by-field reasoning lives on the
     * definition in `@jsprismarine/protocol`.
     */
    private buildPayload(): StartGamePayload {
        const rules =
            this.gameRules instanceof GameRuleManager
                ? [...this.gameRules.getGameRules()].map(([name, [value, editable]]) =>
                      toNetworkGameRule(name, value, editable)
                  )
                : (this.gameRules ?? []);

        return {
            entityId: this.entityId,
            runtimeEntityId: this.runtimeEntityId,
            gamemode: this.gamemode,
            position: { x: this.playerPos.getX(), y: this.playerPos.getY(), z: this.playerPos.getZ() },
            pitch: this.pitch,
            yaw: this.yaw,
            // A negative seed goes out as its two's complement bytes.
            seed: BigInt.asUintN(64, this.seed),
            spawnBiomeType: 0, // Default
            userDefinedBiomeName: 'minecraft:plains',
            dimension: this.dimension,
            generator: this.generator,
            worldGamemode: this.defaultGamemode,
            hardcore: false,
            difficulty: this.difficulty,
            spawnPosition: {
                x: this.worldSpawnPos.getX(),
                y: this.worldSpawnPos.getY(),
                z: this.worldSpawnPos.getZ()
            },
            achievementsDisabled: true,
            editorWorldType: 0, // NonEditor
            createdInEditor: false,
            exportedFromEditor: false,
            editorLevelMigrationVersion: this.editorLevelMigrationVersion,
            dayCycleStopTime: this.time,
            educationEditionOffer: 0, // None
            educationFeaturesEnabled: false,
            educationProductId: '',
            rainLevel: 0,
            lightningLevel: 0,
            confirmedPlatformLockedContent: false,
            multiplayerGame: true,
            lanBroadcast: true,
            xboxLiveBroadcastSetting: 4, // Public
            platformBroadcastSetting: 4, // Public
            commandsEnabled: true,
            texturePacksRequired: false,
            gameRules: rules.map(toWireGameRule),
            experiments: [],
            experimentsEverToggled: false,
            bonusChestEnabled: false,
            startWithMapEnabled: false,
            playerPermissions: 1, // Member
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
            forceExperimentalGameplay: null,
            chatRestrictionLevel: 0, // None
            disablePlayerInteractions: false,
            serverEditorConnectionPolicy: 0, // MatchWorldType
            allowAnonymousBlockDropsInEditorWorlds: false,
            levelId: this.levelId,
            levelName: this.worldName,
            templateContentIdentity: '00000000-0000-0000-0000-000000000000',
            isTrial: false,
            rewindHistorySize: 0,
            serverAuthoritativeBlockBreaking: this.serverAuthoritativeBlockBreaking,
            currentTick: BigInt(this.ticks),
            enchantmentSeed: 0,
            // Every block the client does not have built in: a plugin's blocks, and since
            // 1.26.50 also the vanilla blocks defined in data. Other vanilla blocks are left
            // out on purpose - the client has them, and with hashed runtime ids nothing
            // depends on the order or size of this list.
            blockProperties: [...(this.blockProperties ?? managerBlockProperties())],
            // The item table is not part of this packet since 1.21.60; `ItemRegistryPacket`
            // carries it.
            multiplayerCorrelationId: '',
            enableItemStackNetManager: true,
            serverVersion: this.gameVersion(),
            playerPropertyData: emptyCompound(),
            blockRegistryChecksum: 0n,
            // The nil UUID says the world was not made from a template.
            worldTemplateId: { mostSignificantBits: 0n, leastSignificantBits: 0n },
            // When this is on, the client generates vanilla terrain from the seed for chunks
            // missing from NetworkChunkPublisherUpdate's saved-chunks list, which this server
            // always sends empty. Our generators are not vanilla, so keep it off.
            clientSideGeneration: false,
            // Block runtime ids are hashes of each block's name and state, which is what
            // lets the server compute them from its own definitions.
            blockNetworkIdsAreHashes: true,
            serverAuthoritativeSound: false,
            // Present with none of its three optional parts, as a dedicated server with no
            // gathering, store entry point or presence sends it.
            serverJoinInformation: {},
            serverId: this.serverIdentifier,
            scenarioId: this.scenarioIdentifier,
            worldId: this.worldIdentifier,
            ownerId: ''
        };
    }

    /**
     * The `Server Version` string: the newest game version of the protocol stamped on this
     * packet. A value derived from the stamp, not a layout decision - the layout is the
     * definition's. Read from the version modules, not the codec registry, because the
     * registry's codecs reach this class back through their packet tables.
     */
    protected gameVersion(): string {
        return (VERSIONS_BY_PROTOCOL.get(this.codecProtocol) ?? versions2225).at(-1) ?? '';
    }

    /**
     * Reads the packet in wire order and keeps what this class has fields for.
     *
     * The rest of the payload is decoded - the stream is fully consumed - but not retained:
     * the fields this server writes as fixed values have nowhere to live here.
     */
    public decodePayload(): void {
        const payload = layoutAt(startGamePacket, this.codecProtocol).decode(this);

        this.entityId = payload.entityId;
        this.runtimeEntityId = payload.runtimeEntityId;
        this.gamemode = payload.gamemode;
        this.playerPos = new Vector3(payload.position.x, payload.position.y, payload.position.z);
        this.pitch = payload.pitch;
        this.yaw = payload.yaw;
        // A uint64 on the wire, and a signed 64-bit seed here, as the encoder takes it.
        this.seed = BigInt.asIntN(64, payload.seed);
        this.dimension = payload.dimension;
        this.generator = payload.generator;
        this.defaultGamemode = payload.worldGamemode;
        this.difficulty = payload.difficulty;
        this.worldSpawnPos = new Vector3(payload.spawnPosition.x, payload.spawnPosition.y, payload.spawnPosition.z);
        this.editorLevelMigrationVersion = payload.editorLevelMigrationVersion;
        this.time = payload.dayCycleStopTime;
        this.gameRules = payload.gameRules.map(fromWireGameRule);
        this.levelId = payload.levelId;
        this.worldName = payload.levelName;
        this.serverAuthoritativeBlockBreaking = payload.serverAuthoritativeBlockBreaking;
        this.ticks = Number(payload.currentTick);
        this.blockProperties = payload.blockProperties;
        this.serverIdentifier = payload.serverId;
        this.scenarioIdentifier = payload.scenarioId;
        this.worldIdentifier = payload.worldId;
    }
}

/**
 * `Block Properties` from the managers, which is what a server with the content build off
 * sends: the captured vanilla data-driven definitions, then every schema a plugin registered
 * through `BlockStateSchemas`.
 */
const managerBlockProperties = (): BlockProperty[] => [
    ...block_definitions,
    ...BlockStateSchemas.getCustomSchemas().map((schema) => {
        // Network NBT, with varint lengths. This is not the encoding the runtime id is
        // hashed from; the other one puts bytes on the wire the client cannot parse.
        const stream = new BinaryStream();
        const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
        writer.setUseVarint(true);
        writer.writeCompound(schema.getDefaultState().toNBT(schema.getPropertyTypes()));
        return { name: schema.name, definition: stream.getBuffer() };
    })
];
