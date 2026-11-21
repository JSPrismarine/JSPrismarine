/**
 * `ServerboundDiagnosticsPacket`: client performance telemetry, sent every 500 ms while the
 * client's profiler and the creator telemetry toggle are both on.
 *
 * The payload is nine float averages, then five lists each prefixed by a varuint32 count. Strings
 * are varuint32 length prefixed UTF-8, 64-bit counters are uint64 little endian, and the entity
 * position is three little-endian floats.
 *
 * The 1.26.60 page marks `SystemCategories`, `Position` and `Dimension` optional, each with a
 * leading presence bool. Its changelog says "is now optional", which Mojang's note for that build
 * ("accurately reflect optionality of specific fields", see
 * docs/research/protocol-2225-delta.md) presents as the docs being corrected, not the wire
 * changing, so the presence bytes are written at every version and no version gate is used. No
 * capture of this packet exists, so the 2193 presence bytes rest on that note alone.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/serverbound-diagnostics-packet/
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';
import { vector3 } from '../structureTypes';

import type { PayloadOf } from '../../../wire/define';

/** The fields of one client performance sample. */
export const serverboundDiagnosticsPacket = definePacket('ServerboundDiagnosticsPacket', {
    /** `AvgFps`: average frames per second. */
    avgFps: t.lf32,
    /** `AvgServerSimTickTimeMS`: average server simulation tick time, in milliseconds. */
    avgServerSimTickTimeMs: t.lf32,
    /** `AvgClientSimTickTimeMS`: average client simulation tick time, in milliseconds. */
    avgClientSimTickTimeMs: t.lf32,
    /** `AvgBeginFrameTimeMS`: average begin-frame time, in milliseconds. */
    avgBeginFrameTimeMs: t.lf32,
    /** `AvgInputTimeMS`: average input handling time, in milliseconds. */
    avgInputTimeMs: t.lf32,
    /** `AvgRenderTimeMS`: average render time, in milliseconds. */
    avgRenderTimeMs: t.lf32,
    /** `AvgEndFrameTimeMS`: average end-frame time, in milliseconds. */
    avgEndFrameTimeMs: t.lf32,
    /** `AvgRemainderTimePercent`: the share of frame time not otherwise listed, in percent. */
    avgRemainderTimePercent: t.lf32,
    /** `AvgUnaccountedTimePercent`: the share of frame time nothing accounts for, in percent. */
    avgUnaccountedTimePercent: t.lf32,
    /** `MemoryCategoryValues`: live byte count of each `Memory::MemoryCategory`. */
    memoryCategoryValues: t.list(
        t.record({
            /** `Category`: the memory category, written as a uint8. */
            category: t.uint8,
            /** `CurrentBytes`: live bytes in the category. */
            currentBytes: t.lu64
        })
    ),
    /** `EntityDiagnostics`: the simulation time each entity took in the last sample window. */
    entityDiagnostics: t.list(
        t.record({
            /** `DisplayName`: the entity's display name. */
            displayName: t.string,
            /** `Entity`: the entity's identifier. */
            entity: t.string,
            /** `TimeInNs`: simulation time, in nanoseconds. */
            timeInNs: t.lu64,
            /** `PercentOfTotal`: the share of the total, as a byte. */
            percentOfTotal: t.uint8,
            /** `Position`: where the entity was, as three little-endian floats. Absent is `null`. */
            position: t.optional(vector3),
            /** `Dimension`: the dimension the entity was in. Absent is `null`. */
            dimension: t.optional(t.string)
        })
    ),
    /** `SystemDiagnostics`: the time each client system took in the last sample window. */
    systemDiagnostics: t.list(
        t.record({
            /** `DisplayName`: the system's display name. */
            displayName: t.string,
            /** `SystemIndex`: the system's index. */
            systemIndex: t.lu64,
            /** `TimeInNs`: time spent in the system, in nanoseconds. */
            timeInNs: t.lu64,
            /** `PercentOfTotal`: the share of the total, as a byte. */
            percentOfTotal: t.uint8
        })
    ),
    /** `SystemCategories`: the category name each system index belongs to. Absent is `null`. */
    systemCategories: t.optional(
        t.list(
            t.record({
                /** `CategoryName`: the category's name. */
                categoryName: t.string,
                /** `SystemIndex`: the system index in that category. */
                systemIndex: t.lu64
            })
        )
    ),
    /** `WhiskerScopes`: the cost summary of each profiler scope. */
    whiskerScopes: t.list(
        t.record({
            /** `Label`: the scope's label. */
            label: t.string,
            /** `Indentation`: the scope's indentation text. */
            indentation: t.string,
            /** `TotalHighCostNs`: total high cost, in nanoseconds. */
            totalHighCostNs: t.lu64,
            /** `TotalMidCostNs`: total mid cost, in nanoseconds. */
            totalMidCostNs: t.lu64,
            /** `TotalLowCostNs`: total low cost, in nanoseconds. */
            totalLowCostNs: t.lu64
        })
    )
});

/** Payload carried by `ServerboundDiagnosticsPacket`. */
export type ServerboundDiagnosticsPayload = PayloadOf<typeof serverboundDiagnosticsPacket>;
