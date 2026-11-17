/**
 * `LegacyTelemetryEventPacket`: hands a telemetry event to the client so the client can forward
 * it to Mojang's eventing service.
 *
 * Field names and order follow the docs' packet page (docs id 65). `Event Data` is a `oneOf`: a `varuint32` alternative number,
 * then that alternative's own fields.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/legacy-telemetry-event-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type BinaryStream from '@jsprismarine/binaryutils';
import type { PayloadOf } from '../define';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

/**
 * The events a {@link LegacyTelemetryEventPacket} reports, numbered by its Event Type varint32.
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
 * the block interaction type and the damage source - stay plain numbers. The 1.26.60
 * changelog renumbers `AchievementIds`, `InteractionType` and `ActorType` between 2193 and
 * 2225, so a number here has no name that holds at both versions and naming them would
 * invent values.
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

/** One alternative of the Event Data `oneOf`: its fields, with the ordinal added on read. */
interface EventDataVariant<D> {
    write(stream: BinaryStream, value: D): void;
    read(stream: BinaryStream): D;
}

type EventDataOrdinal = (typeof LegacyTelemetryEventDataOrdinal)[keyof typeof LegacyTelemetryEventDataOrdinal];

/** Wraps an alternative's fields as a record and tags what it reads with the alternative's ordinal. */
const variant = <O extends EventDataOrdinal, F extends Record<string, t.WireType<unknown>>>(
    ordinal: O,
    fields: F
): EventDataVariant<{ ordinal: O } & t.RecordOf<F>> => {
    const body = t.record(fields);
    return {
        write: (stream, value) => body.write(stream, value),
        read: (stream) => ({ ordinal, ...body.read(stream) })
    };
};

const Ordinal = LegacyTelemetryEventDataOrdinal;

/** Every alternative, keyed by the ordinal that selects it. */
const eventDataVariants: {
    [K in EventDataOrdinal]: EventDataVariant<Extract<LegacyTelemetryEventData, { ordinal: K }>>;
} = {
    [Ordinal.Achievement]: variant(Ordinal.Achievement, { achievementId: t.uint8 }),
    [Ordinal.Interaction]: variant(Ordinal.Interaction, {
        interactedEntityId: t.varint64,
        interactionType: t.uint8,
        interactionActorType: t.varint32,
        interactionActorVariant: t.varint32,
        interactionActorColor: t.uint8
    }),
    [Ordinal.PortalCreated]: variant(Ordinal.PortalCreated, { dimensionId: t.varint32 }),
    [Ordinal.PortalUsed]: variant(Ordinal.PortalUsed, {
        sourceDimensionId: t.varint32,
        targetDimensionId: t.varint32
    }),
    [Ordinal.MobKilled]: variant(Ordinal.MobKilled, {
        instigatorActorId: t.varint64,
        targetActorId: t.varint64,
        instigatorChildActorType: t.varint32,
        damageSource: t.varint32,
        tradeTier: t.varint32,
        traderName: t.string
    }),
    [Ordinal.CauldronUsed]: variant(Ordinal.CauldronUsed, {
        contentsColor: t.varuint32,
        contentsType: t.li16,
        fillLevel: t.li16
    }),
    [Ordinal.PlayerDied]: variant(Ordinal.PlayerDied, {
        instigatorActorId: t.varint32,
        instigatorMobVariant: t.varint32,
        damageSource: t.varint32,
        diedInRaid: t.bool
    }),
    [Ordinal.BossKilled]: variant(Ordinal.BossKilled, {
        bossActorId: t.varint64,
        partySize: t.varint32,
        bossType: t.varint32
    }),
    [Ordinal.SlashCommand]: variant(Ordinal.SlashCommand, {
        successCount: t.varint32,
        errorCount: t.varint32,
        commandName: t.string,
        errorList: t.string
    }),
    [Ordinal.MobBorn]: variant(Ordinal.MobBorn, {
        bornBabyEntityType: t.varint32,
        bornBabyEntityVariant: t.varint32,
        bornBabyColor: t.uint8
    }),
    [Ordinal.POICauldronUsed]: variant(Ordinal.POICauldronUsed, { blockInteractionType: t.uint8, itemId: t.li16 }),
    [Ordinal.ComposterUsed]: variant(Ordinal.ComposterUsed, { blockInteractionType: t.uint8, itemId: t.li16 }),
    [Ordinal.BellUsed]: variant(Ordinal.BellUsed, { itemId: t.li16 }),
    [Ordinal.ActorDefinition]: variant(Ordinal.ActorDefinition, { eventName: t.string }),
    [Ordinal.RaidUpdate]: variant(Ordinal.RaidUpdate, {
        currentWave: t.varint32,
        totalWaves: t.varint32,
        success: t.bool
    }),
    [Ordinal.TargetBlockHit]: variant(Ordinal.TargetBlockHit, { redstoneLevel: t.varint32 }),
    [Ordinal.PiglinBarter]: variant(Ordinal.PiglinBarter, {
        itemId: t.varint32,
        wasTargetingBarteringPlayer: t.bool
    }),
    [Ordinal.PlayerWaxedOrUnwaxedCopper]: variant(Ordinal.PlayerWaxedOrUnwaxedCopper, {
        playerWaxedOrUnwaxedCopperBlockId: t.varint32
    }),
    [Ordinal.CodeBuilderRuntimeAction]: variant(Ordinal.CodeBuilderRuntimeAction, {
        codeBuilderRuntimeAction: t.string
    }),
    [Ordinal.CodeBuilderScoreboard]: variant(Ordinal.CodeBuilderScoreboard, {
        objectiveName: t.string,
        score: t.varint32
    }),
    [Ordinal.ItemUsed]: variant(Ordinal.ItemUsed, {
        itemId: t.li16,
        itemAux: t.li32,
        useMethod: t.li32,
        count: t.li32
    }),
    [Ordinal.Empty]: variant(Ordinal.Empty, {})
};

/** Picks the alternative for an ordinal; a union of ordinals gets the union of their payloads. */
const variantFor = <K extends EventDataOrdinal>(
    ordinal: K
): EventDataVariant<Extract<LegacyTelemetryEventData, { ordinal: K }>> => eventDataVariants[ordinal];

const isEventDataOrdinal = (ordinal: number): ordinal is EventDataOrdinal => Object.hasOwn(eventDataVariants, ordinal);

/**
 * The Event Data `oneOf`: a `varuint32` ordinal, then the alternative's own fields.
 *
 * Custom because the fields that follow depend on the ordinal's value. An unknown ordinal
 * throws on read.
 */
const eventData = t.custom<LegacyTelemetryEventData>(
    'oneOf<varuint32>',
    (stream, value) => {
        stream.writeUnsignedVarInt(value.ordinal);
        variantFor(value.ordinal).write(stream, value);
    },
    (stream) => {
        const ordinal = stream.readUnsignedVarInt();
        if (!isEventDataOrdinal(ordinal))
            throw new ProtocolWireErrors.UnknownTelemetryEventDataAlternative({ ordinal });
        return variantFor(ordinal).read(stream);
    }
);

/** The `LegacyTelemetryEventPacket` field list; the module doc carries the wire provenance. */
export const legacyTelemetryEventPacket = definePacket('LegacyTelemetryEventPacket', {
    /** `Target Actor ID`: the actor the event is about. */
    targetActorId: t.varint64,
    /** `Event Type`: what happened; see {@link LegacyTelemetryEventType}. */
    eventType: t.enumOf<LegacyTelemetryEventType>(t.varint32),
    /** `Use Player ID`: whose purpose Mojang has never documented. */
    usePlayerId: t.bool,
    /** `Event Data`: the payload belonging to the event. */
    eventData
});

/** The telemetry event's payload. */
export type LegacyTelemetryEventPayload = PayloadOf<typeof legacyTelemetryEventPacket>;
