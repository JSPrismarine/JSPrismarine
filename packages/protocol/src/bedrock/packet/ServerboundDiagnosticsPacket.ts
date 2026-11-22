import FieldNetworkPacket from '../../FieldNetworkPacket';
import { serverboundDiagnosticsPacket } from '../wire/definitions/serverboundDiagnostics';
import { layoutAt } from '../../wire/WireLayout';

import type { ServerboundDiagnosticsPayload } from '../wire/definitions/serverboundDiagnostics';

/** Live byte count of one `Memory::MemoryCategory`, which the client writes as a uint8. */
export type MemoryCategoryCounter = ServerboundDiagnosticsPayload['memoryCategoryValues'][number];

/** Simulation time one entity took in the client's last sample window. */
export type EntityDiagnosticTimingInfo = ServerboundDiagnosticsPayload['entityDiagnostics'][number];

/** Time one client system took in the last sample window. */
export type SystemDiagnosticTimingInfo = ServerboundDiagnosticsPayload['systemDiagnostics'][number];

/** Name of the category a system index belongs to. */
export type SystemCategory = NonNullable<ServerboundDiagnosticsPayload['systemCategories']>[number];

/** Cost summary of one profiler scope. */
export type WhiskerScopeDataSummary = ServerboundDiagnosticsPayload['whiskerScopes'][number];

/**
 * Client performance telemetry, sent every 500 ms while the client's profiler and the
 * creator telemetry toggle are both on.
 *
 * Wire layout: nine float LE averages, then five lists each prefixed by a varuint32 count. Strings
 * are varuint32 length prefixed UTF-8, 64-bit counters are uint64 LE, the entity position is three
 * float LE. The system category list, and each entity's position and dimension, lead with a
 * presence bool and read as `null` when absent.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/serverbound-diagnostics-packet/
 */
export default class ServerboundDiagnosticsPacket extends FieldNetworkPacket {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'ServerboundDiagnosticsPacket';
    }

    public avgFps = 0;
    public avgServerSimTickTimeMs = 0;
    public avgClientSimTickTimeMs = 0;
    public avgBeginFrameTimeMs = 0;
    public avgInputTimeMs = 0;
    public avgRenderTimeMs = 0;
    public avgEndFrameTimeMs = 0;
    public avgRemainderTimePercent = 0;
    public avgUnaccountedTimePercent = 0;
    public memoryCategoryValues: MemoryCategoryCounter[] = [];
    public entityDiagnostics: EntityDiagnosticTimingInfo[] = [];
    public systemDiagnostics: SystemDiagnosticTimingInfo[] = [];
    public systemCategories: SystemCategory[] | null = [];
    public whiskerScopes: WhiskerScopeDataSummary[] = [];

    /** Writes the averages and the five lists, for tests and for a client built on this package. */
    public encodePayload(): void {
        layoutAt(serverboundDiagnosticsPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads the averages and the five lists. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(serverboundDiagnosticsPacket, this.codecProtocol).decode(this));
    }
}
