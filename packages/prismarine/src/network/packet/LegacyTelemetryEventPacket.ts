import { NetworkUtil } from '../NetworkUtil';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * What a {@link LegacyTelemetryEventPacket} reports, as the Event Type varint32 numbers it.
 *
 * The members the docs mark `_OBSOLETE` keep their slot so the numbering of the rest stays
 * right; nothing sends them. They are spelled with an `Obsolete` suffix here.
 */
export enum LegacyTelemetryEventType {
    Achievement = 0,
    Interaction = 1,
    PortalCreated = 2,
    PortalUsed = 3,
    MobKilled = 4,
    CauldronUsed = 5,
    PlayerDied = 6,
    BossKilled = 7,
    AgentCommandObsolete = 8,
    AgentCreated = 9,
    PatternRemovedObsolete = 10,
    SlashCommand = 11,
    FishBucketedObsolete = 12,
    MobBorn = 13,
    PetDiedObsolete = 14,
    POICauldronUsed = 15,
    ComposterUsed = 16,
    BellUsed = 17,
    ActorDefinition = 18,
    RaidUpdate = 19,
    PlayerMovementAnomalyObsolete = 20,
    PlayerMovementCorrectedObsolete = 21,
    HoneyHarvested = 22,
    TargetBlockHit = 23,
    PiglinBarter = 24,
    PlayerWaxedOrUnwaxedCopper = 25,
    CodeBuilderRuntimeAction = 26,
    CodeBuilderScoreboard = 27,
    StriderRiddenInLavaInOverworld = 28,
    SneakCloseToSculkSensor = 29,
    CarefulRestoration = 30,
    ItemUsed = 31
}

/**
 * The alternatives of the Event Data `oneOf`, as its varuint32 selector numbers them.
 *
 * The selector is not the Event Type: several event types carry no data of their own and
 * share the {@link LegacyTelemetryEventDataOrdinal.Empty} alternative.
 */
export const LegacyTelemetryEventDataOrdinal = {
    Achievement: 0,
    Interaction: 1,
    PortalCreated: 2,
    PortalUsed: 3,
    MobKilled: 4,
    CauldronUsed: 5,
    PlayerDied: 6,
    BossKilled: 7,
    SlashCommand: 8,
    MobBorn: 9,
    POICauldronUsed: 10,
    ComposterUsed: 11,
    BellUsed: 12,
    ActorDefinition: 13,
    RaidUpdate: 14,
    TargetBlockHit: 15,
    PiglinBarter: 16,
    PlayerWaxedOrUnwaxedCopper: 17,
    CodeBuilderRuntimeAction: 18,
    CodeBuilderScoreboard: 19,
    ItemUsed: 20,
    Empty: 21
} as const;

/**
 * The payload of one telemetry event, tagged with the alternative it travels as.
 *
 * Fields the docs type as an enum - the achievement, the interaction type, the actor type,
 * the block interaction type and the damage source - stay plain numbers. The docs print
 * those enums' members by list position, and the changelog for `ActorType` shows the real
 * wire values are nothing like their positions, so naming them here would invent values.
 */
export type LegacyTelemetryEventData =
    | { ordinal: typeof LegacyTelemetryEventDataOrdinal.Achievement; achievementId: number }
    | {
          ordinal: typeof LegacyTelemetryEventDataOrdinal.Interaction;
          interactedEntityId: bigint;
          interactionType: number;
          interactionActorType: number;
          interactionActorVariant: number;
          interactionActorColor: number;
      }
    | { ordinal: typeof LegacyTelemetryEventDataOrdinal.PortalCreated; dimensionId: number }
    | {
          ordinal: typeof LegacyTelemetryEventDataOrdinal.PortalUsed;
          sourceDimensionId: number;
          targetDimensionId: number;
      }
    | {
          ordinal: typeof LegacyTelemetryEventDataOrdinal.MobKilled;
          instigatorActorId: bigint;
          targetActorId: bigint;
          instigatorChildActorType: number;
          damageSource: number;
          /** -1 when the victim does not trade. */
          tradeTier: number;
          /** Empty when the victim does not trade. */
          traderName: string;
      }
    | {
          ordinal: typeof LegacyTelemetryEventDataOrdinal.CauldronUsed;
          contentsColor: number;
          contentsType: number;
          fillLevel: number;
      }
    | {
          ordinal: typeof LegacyTelemetryEventDataOrdinal.PlayerDied;
          instigatorActorId: number;
          instigatorMobVariant: number;
          damageSource: number;
          diedInRaid: boolean;
      }
    | {
          ordinal: typeof LegacyTelemetryEventDataOrdinal.BossKilled;
          bossActorId: bigint;
          partySize: number;
          bossType: number;
      }
    | {
          ordinal: typeof LegacyTelemetryEventDataOrdinal.SlashCommand;
          successCount: number;
          errorCount: number;
          commandName: string;
          /** The error messages, joined with semicolons. */
          errorList: string;
      }
    | {
          ordinal: typeof LegacyTelemetryEventDataOrdinal.MobBorn;
          bornBabyEntityType: number;
          bornBabyEntityVariant: number;
          bornBabyColor: number;
      }
    | {
          ordinal: typeof LegacyTelemetryEventDataOrdinal.POICauldronUsed;
          blockInteractionType: number;
          itemId: number;
      }
    | {
          ordinal: typeof LegacyTelemetryEventDataOrdinal.ComposterUsed;
          blockInteractionType: number;
          itemId: number;
      }
    | { ordinal: typeof LegacyTelemetryEventDataOrdinal.BellUsed; itemId: number }
    | { ordinal: typeof LegacyTelemetryEventDataOrdinal.ActorDefinition; eventName: string }
    | {
          ordinal: typeof LegacyTelemetryEventDataOrdinal.RaidUpdate;
          currentWave: number;
          totalWaves: number;
          success: boolean;
      }
    | { ordinal: typeof LegacyTelemetryEventDataOrdinal.TargetBlockHit; redstoneLevel: number }
    | {
          ordinal: typeof LegacyTelemetryEventDataOrdinal.PiglinBarter;
          itemId: number;
          wasTargetingBarteringPlayer: boolean;
      }
    | {
          ordinal: typeof LegacyTelemetryEventDataOrdinal.PlayerWaxedOrUnwaxedCopper;
          playerWaxedOrUnwaxedCopperBlockId: number;
      }
    | {
          ordinal: typeof LegacyTelemetryEventDataOrdinal.CodeBuilderRuntimeAction;
          codeBuilderRuntimeAction: string;
      }
    | {
          ordinal: typeof LegacyTelemetryEventDataOrdinal.CodeBuilderScoreboard;
          objectiveName: string;
          score: number;
      }
    | {
          ordinal: typeof LegacyTelemetryEventDataOrdinal.ItemUsed;
          itemId: number;
          itemAux: number;
          useMethod: number;
          count: number;
      }
    | { ordinal: typeof LegacyTelemetryEventDataOrdinal.Empty };

/**
 * Hands a telemetry event to the client so the client can forward it to Mojang's eventing
 * service.
 *
 * **Bound To:** Client
 *
 * The server does nothing with the event itself; the client is only a relay. This server
 * reports no telemetry, so nothing builds one of these, but the layout is here so a captured
 * session decodes.
 *
 * Protocol 2193 layout (docs id 65), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Target Actor ID | varint64 | The actor the event is about |
 * | Event Type | varint32 | One of {@link LegacyTelemetryEventType} |
 * | Use Player ID | boolean | |
 * | Event Data | oneOf | A varuint32 ordinal, then the alternative's own fields |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/legacy-telemetry-event-packet/
 */
export default class LegacyTelemetryEventPacket extends FieldNetworkPacket {
    /** Target Actor ID, the actor the event happened to. */
    public targetActorId = 0n;

    /** Event Type, what happened. */
    public eventType: LegacyTelemetryEventType = LegacyTelemetryEventType.Achievement;

    /** Use Player ID, whose purpose Mojang has never documented. */
    public usePlayerId = false;

    /** Event Data, the payload belonging to the event. */
    public eventData: LegacyTelemetryEventData = { ordinal: LegacyTelemetryEventDataOrdinal.Empty };

    /** Reads the actor, the event type, and the event's own payload. */
    public decodePayload(): void {
        this.targetActorId = this.readVarLong();
        this.eventType = this.readVarInt();
        this.usePlayerId = this.readBoolean();
        this.eventData = this.readEventData();
    }

    /** Writes the actor, the event type, and the event's own payload. */
    public encodePayload(): void {
        this.writeVarLong(this.targetActorId);
        this.writeVarInt(this.eventType);
        this.writeBoolean(this.usePlayerId);
        this.writeEventData(this.eventData);
    }

    private readEventData(): LegacyTelemetryEventData {
        const ordinal = this.readUnsignedVarInt();
        switch (ordinal) {
            case LegacyTelemetryEventDataOrdinal.Achievement:
                return { ordinal, achievementId: this.readByte() };
            case LegacyTelemetryEventDataOrdinal.Interaction:
                return {
                    ordinal,
                    interactedEntityId: this.readVarLong(),
                    interactionType: this.readByte(),
                    interactionActorType: this.readVarInt(),
                    interactionActorVariant: this.readVarInt(),
                    interactionActorColor: this.readByte()
                };
            case LegacyTelemetryEventDataOrdinal.PortalCreated:
                return { ordinal, dimensionId: this.readVarInt() };
            case LegacyTelemetryEventDataOrdinal.PortalUsed:
                return { ordinal, sourceDimensionId: this.readVarInt(), targetDimensionId: this.readVarInt() };
            case LegacyTelemetryEventDataOrdinal.MobKilled:
                return {
                    ordinal,
                    instigatorActorId: this.readVarLong(),
                    targetActorId: this.readVarLong(),
                    instigatorChildActorType: this.readVarInt(),
                    damageSource: this.readVarInt(),
                    tradeTier: this.readVarInt(),
                    traderName: NetworkUtil.readString(this)
                };
            case LegacyTelemetryEventDataOrdinal.CauldronUsed:
                return {
                    ordinal,
                    contentsColor: this.readUnsignedVarInt(),
                    contentsType: this.readShortLE(),
                    fillLevel: this.readShortLE()
                };
            case LegacyTelemetryEventDataOrdinal.PlayerDied:
                return {
                    ordinal,
                    instigatorActorId: this.readVarInt(),
                    instigatorMobVariant: this.readVarInt(),
                    damageSource: this.readVarInt(),
                    diedInRaid: this.readBoolean()
                };
            case LegacyTelemetryEventDataOrdinal.BossKilled:
                return {
                    ordinal,
                    bossActorId: this.readVarLong(),
                    partySize: this.readVarInt(),
                    bossType: this.readVarInt()
                };
            case LegacyTelemetryEventDataOrdinal.SlashCommand:
                return {
                    ordinal,
                    successCount: this.readVarInt(),
                    errorCount: this.readVarInt(),
                    commandName: NetworkUtil.readString(this),
                    errorList: NetworkUtil.readString(this)
                };
            case LegacyTelemetryEventDataOrdinal.MobBorn:
                return {
                    ordinal,
                    bornBabyEntityType: this.readVarInt(),
                    bornBabyEntityVariant: this.readVarInt(),
                    bornBabyColor: this.readByte()
                };
            case LegacyTelemetryEventDataOrdinal.POICauldronUsed:
                return { ordinal, blockInteractionType: this.readByte(), itemId: this.readShortLE() };
            case LegacyTelemetryEventDataOrdinal.ComposterUsed:
                return { ordinal, blockInteractionType: this.readByte(), itemId: this.readShortLE() };
            case LegacyTelemetryEventDataOrdinal.BellUsed:
                return { ordinal, itemId: this.readShortLE() };
            case LegacyTelemetryEventDataOrdinal.ActorDefinition:
                return { ordinal, eventName: NetworkUtil.readString(this) };
            case LegacyTelemetryEventDataOrdinal.RaidUpdate:
                return {
                    ordinal,
                    currentWave: this.readVarInt(),
                    totalWaves: this.readVarInt(),
                    success: this.readBoolean()
                };
            case LegacyTelemetryEventDataOrdinal.TargetBlockHit:
                return { ordinal, redstoneLevel: this.readVarInt() };
            case LegacyTelemetryEventDataOrdinal.PiglinBarter:
                return { ordinal, itemId: this.readVarInt(), wasTargetingBarteringPlayer: this.readBoolean() };
            case LegacyTelemetryEventDataOrdinal.PlayerWaxedOrUnwaxedCopper:
                return { ordinal, playerWaxedOrUnwaxedCopperBlockId: this.readVarInt() };
            case LegacyTelemetryEventDataOrdinal.CodeBuilderRuntimeAction:
                return { ordinal, codeBuilderRuntimeAction: NetworkUtil.readString(this) };
            case LegacyTelemetryEventDataOrdinal.CodeBuilderScoreboard:
                return { ordinal, objectiveName: NetworkUtil.readString(this), score: this.readVarInt() };
            case LegacyTelemetryEventDataOrdinal.ItemUsed:
                return {
                    ordinal,
                    itemId: this.readShortLE(),
                    itemAux: this.readIntLE(),
                    useMethod: this.readIntLE(),
                    count: this.readIntLE()
                };
            case LegacyTelemetryEventDataOrdinal.Empty:
                return { ordinal };
            default:
                throw new Error(`Unknown telemetry event data alternative ${ordinal}`);
        }
    }

    private writeEventData(data: LegacyTelemetryEventData): void {
        this.writeUnsignedVarInt(data.ordinal);
        switch (data.ordinal) {
            case LegacyTelemetryEventDataOrdinal.Achievement:
                this.writeByte(data.achievementId);
                break;
            case LegacyTelemetryEventDataOrdinal.Interaction:
                this.writeVarLong(data.interactedEntityId);
                this.writeByte(data.interactionType);
                this.writeVarInt(data.interactionActorType);
                this.writeVarInt(data.interactionActorVariant);
                this.writeByte(data.interactionActorColor);
                break;
            case LegacyTelemetryEventDataOrdinal.PortalCreated:
                this.writeVarInt(data.dimensionId);
                break;
            case LegacyTelemetryEventDataOrdinal.PortalUsed:
                this.writeVarInt(data.sourceDimensionId);
                this.writeVarInt(data.targetDimensionId);
                break;
            case LegacyTelemetryEventDataOrdinal.MobKilled:
                this.writeVarLong(data.instigatorActorId);
                this.writeVarLong(data.targetActorId);
                this.writeVarInt(data.instigatorChildActorType);
                this.writeVarInt(data.damageSource);
                this.writeVarInt(data.tradeTier);
                NetworkUtil.writeString(this, data.traderName);
                break;
            case LegacyTelemetryEventDataOrdinal.CauldronUsed:
                this.writeUnsignedVarInt(data.contentsColor);
                this.writeShortLE(data.contentsType);
                this.writeShortLE(data.fillLevel);
                break;
            case LegacyTelemetryEventDataOrdinal.PlayerDied:
                this.writeVarInt(data.instigatorActorId);
                this.writeVarInt(data.instigatorMobVariant);
                this.writeVarInt(data.damageSource);
                this.writeBoolean(data.diedInRaid);
                break;
            case LegacyTelemetryEventDataOrdinal.BossKilled:
                this.writeVarLong(data.bossActorId);
                this.writeVarInt(data.partySize);
                this.writeVarInt(data.bossType);
                break;
            case LegacyTelemetryEventDataOrdinal.SlashCommand:
                this.writeVarInt(data.successCount);
                this.writeVarInt(data.errorCount);
                NetworkUtil.writeString(this, data.commandName);
                NetworkUtil.writeString(this, data.errorList);
                break;
            case LegacyTelemetryEventDataOrdinal.MobBorn:
                this.writeVarInt(data.bornBabyEntityType);
                this.writeVarInt(data.bornBabyEntityVariant);
                this.writeByte(data.bornBabyColor);
                break;
            case LegacyTelemetryEventDataOrdinal.POICauldronUsed:
            case LegacyTelemetryEventDataOrdinal.ComposterUsed:
                this.writeByte(data.blockInteractionType);
                this.writeShortLE(data.itemId);
                break;
            case LegacyTelemetryEventDataOrdinal.BellUsed:
                this.writeShortLE(data.itemId);
                break;
            case LegacyTelemetryEventDataOrdinal.ActorDefinition:
                NetworkUtil.writeString(this, data.eventName);
                break;
            case LegacyTelemetryEventDataOrdinal.RaidUpdate:
                this.writeVarInt(data.currentWave);
                this.writeVarInt(data.totalWaves);
                this.writeBoolean(data.success);
                break;
            case LegacyTelemetryEventDataOrdinal.TargetBlockHit:
                this.writeVarInt(data.redstoneLevel);
                break;
            case LegacyTelemetryEventDataOrdinal.PiglinBarter:
                this.writeVarInt(data.itemId);
                this.writeBoolean(data.wasTargetingBarteringPlayer);
                break;
            case LegacyTelemetryEventDataOrdinal.PlayerWaxedOrUnwaxedCopper:
                this.writeVarInt(data.playerWaxedOrUnwaxedCopperBlockId);
                break;
            case LegacyTelemetryEventDataOrdinal.CodeBuilderRuntimeAction:
                NetworkUtil.writeString(this, data.codeBuilderRuntimeAction);
                break;
            case LegacyTelemetryEventDataOrdinal.CodeBuilderScoreboard:
                NetworkUtil.writeString(this, data.objectiveName);
                this.writeVarInt(data.score);
                break;
            case LegacyTelemetryEventDataOrdinal.ItemUsed:
                this.writeShortLE(data.itemId);
                this.writeIntLE(data.itemAux);
                this.writeIntLE(data.useMethod);
                this.writeIntLE(data.count);
                break;
            default:
                break; // Empty carries no fields.
        }
    }
}
