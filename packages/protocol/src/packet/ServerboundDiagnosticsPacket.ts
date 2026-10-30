import type { Vector3 } from '@jsprismarine/math';
import FieldNetworkPacket from '../FieldNetworkPacket';
import { NetworkUtil } from '../wire/networkUtil';

/** Live byte count of one `Memory::MemoryCategory`, which the client writes as a uint8. */
export interface MemoryCategoryCounter {
    category: number;
    currentBytes: bigint;
}

/** Simulation time one entity took in the client's last sample window. */
export interface EntityDiagnosticTimingInfo {
    displayName: string;
    entity: string;
    timeInNs: bigint;
    percentOfTotal: number;
    position: Vector3;
    dimension: string;
}

/** Time one client system took in the last sample window. */
export interface SystemDiagnosticTimingInfo {
    displayName: string;
    systemIndex: bigint;
    timeInNs: bigint;
    percentOfTotal: number;
}

/** Name of the category a system index belongs to. */
export interface SystemCategory {
    categoryName: string;
    systemIndex: bigint;
}

/** Cost summary of one profiler scope. */
export interface WhiskerScopeDataSummary {
    label: string;
    indentation: string;
    totalHighCostNs: bigint;
    totalMidCostNs: bigint;
    totalLowCostNs: bigint;
}

/**
 * Client performance telemetry, sent every 500 ms while the client's profiler and the
 * creator telemetry toggle are both on.
 *
 * Wire layout at protocol 2193: nine float LE averages, then five lists each prefixed by a
 * varuint32 count. Strings are varuint32 length prefixed UTF-8, 64-bit counters are uint64 LE,
 * the entity position is three float LE.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/serverbound-diagnostics-packet/
 */
export default class ServerboundDiagnosticsPacket extends FieldNetworkPacket {
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
    public systemCategories: SystemCategory[] = [];
    public whiskerScopes: WhiskerScopeDataSummary[] = [];

    /** Reads the averages and the five lists. */
    public decodePayload(): void {
        this.avgFps = this.readFloatLE();
        this.avgServerSimTickTimeMs = this.readFloatLE();
        this.avgClientSimTickTimeMs = this.readFloatLE();
        this.avgBeginFrameTimeMs = this.readFloatLE();
        this.avgInputTimeMs = this.readFloatLE();
        this.avgRenderTimeMs = this.readFloatLE();
        this.avgEndFrameTimeMs = this.readFloatLE();
        this.avgRemainderTimePercent = this.readFloatLE();
        this.avgUnaccountedTimePercent = this.readFloatLE();

        this.memoryCategoryValues = this.readList(() => ({
            category: this.readByte(),
            currentBytes: this.readUnsignedLongLE()
        }));
        this.entityDiagnostics = this.readList(() => ({
            displayName: NetworkUtil.readString(this),
            entity: NetworkUtil.readString(this),
            timeInNs: this.readUnsignedLongLE(),
            percentOfTotal: this.readByte(),
            position: NetworkUtil.readVector3(this),
            dimension: NetworkUtil.readString(this)
        }));
        this.systemDiagnostics = this.readList(() => ({
            displayName: NetworkUtil.readString(this),
            systemIndex: this.readUnsignedLongLE(),
            timeInNs: this.readUnsignedLongLE(),
            percentOfTotal: this.readByte()
        }));
        this.systemCategories = this.readList(() => ({
            categoryName: NetworkUtil.readString(this),
            systemIndex: this.readUnsignedLongLE()
        }));
        this.whiskerScopes = this.readList(() => ({
            label: NetworkUtil.readString(this),
            indentation: NetworkUtil.readString(this),
            totalHighCostNs: this.readUnsignedLongLE(),
            totalMidCostNs: this.readUnsignedLongLE(),
            totalLowCostNs: this.readUnsignedLongLE()
        }));
    }

    /** Writes the averages and the five lists, for tests and for a client built on this package. */
    public encodePayload(): void {
        this.writeFloatLE(this.avgFps);
        this.writeFloatLE(this.avgServerSimTickTimeMs);
        this.writeFloatLE(this.avgClientSimTickTimeMs);
        this.writeFloatLE(this.avgBeginFrameTimeMs);
        this.writeFloatLE(this.avgInputTimeMs);
        this.writeFloatLE(this.avgRenderTimeMs);
        this.writeFloatLE(this.avgEndFrameTimeMs);
        this.writeFloatLE(this.avgRemainderTimePercent);
        this.writeFloatLE(this.avgUnaccountedTimePercent);

        this.writeList(this.memoryCategoryValues, (counter) => {
            this.writeByte(counter.category);
            this.writeUnsignedLongLE(counter.currentBytes);
        });
        this.writeList(this.entityDiagnostics, (info) => {
            NetworkUtil.writeString(this, info.displayName);
            NetworkUtil.writeString(this, info.entity);
            this.writeUnsignedLongLE(info.timeInNs);
            this.writeByte(info.percentOfTotal);
            NetworkUtil.writeVector3(this, info.position);
            NetworkUtil.writeString(this, info.dimension);
        });
        this.writeList(this.systemDiagnostics, (info) => {
            NetworkUtil.writeString(this, info.displayName);
            this.writeUnsignedLongLE(info.systemIndex);
            this.writeUnsignedLongLE(info.timeInNs);
            this.writeByte(info.percentOfTotal);
        });
        this.writeList(this.systemCategories, (category) => {
            NetworkUtil.writeString(this, category.categoryName);
            this.writeUnsignedLongLE(category.systemIndex);
        });
        this.writeList(this.whiskerScopes, (scope) => {
            NetworkUtil.writeString(this, scope.label);
            NetworkUtil.writeString(this, scope.indentation);
            this.writeUnsignedLongLE(scope.totalHighCostNs);
            this.writeUnsignedLongLE(scope.totalMidCostNs);
            this.writeUnsignedLongLE(scope.totalLowCostNs);
        });
    }

    private readList<T>(readOne: () => T): T[] {
        const count = this.readUnsignedVarInt();
        const items: T[] = [];
        for (let index = 0; index < count; index++) items.push(readOne());

        return items;
    }

    private writeList<T>(items: T[], writeOne: (item: T) => void): void {
        this.writeUnsignedVarInt(items.length);
        for (const item of items) writeOne(item);
    }
}
