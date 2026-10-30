import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';
import ServerboundDiagnosticsPacket from './ServerboundDiagnosticsPacket';

const f32 = (value: number): Buffer => {
    const buffer = Buffer.alloc(4);
    buffer.writeFloatLE(value);
    return buffer;
};
const u64 = (value: bigint): Buffer => {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64LE(value);
    return buffer;
};
const str = (value: string): Buffer => Buffer.concat([Buffer.from([value.length]), Buffer.from(value, 'utf8')]);

describe('ServerboundDiagnosticsPacket', () => {
    // Header: id 315 as LEB128 is 0xbb 0x02.
    const header = Buffer.from([0xbb, 0x02]);

    it('decodes nine floats and one entry in each list, consuming the whole buffer', () => {
        const buffer = Buffer.concat([
            header,
            f32(60), // AvgFps
            f32(1.5), // AvgServerSimTickTimeMS
            f32(2.5), // AvgClientSimTickTimeMS
            f32(0.5), // AvgBeginFrameTimeMS
            f32(0.25), // AvgInputTimeMS
            f32(8), // AvgRenderTimeMS
            f32(0.75), // AvgEndFrameTimeMS
            f32(10), // AvgRemainderTimePercent
            f32(5), // AvgUnaccountedTimePercent
            Buffer.from([0x01, 0x2c]), // one MemoryCategoryCounter, category 44 (Network)
            u64(4096n),
            Buffer.from([0x01]), // one EntityDiagnosticTimingInfo
            str('Zombie'),
            str('minecraft:zombie'),
            u64(1000n),
            Buffer.from([0x32]), // 50 percent
            f32(1),
            f32(64),
            f32(-3),
            str('overworld'),
            Buffer.from([0x01]), // one SystemDiagnosticTimingInfo
            str('Physics'),
            u64(7n),
            u64(2000n),
            Buffer.from([0x19]), // 25 percent
            Buffer.from([0x01]), // one SystemCategory
            str('Simulation'),
            u64(7n),
            Buffer.from([0x01]), // one WhiskerScopeDataSummary
            str('tick'),
            str('  '),
            u64(3n),
            u64(2n),
            u64(1n)
        ]);
        const packet = new ServerboundDiagnosticsPacket(buffer);
        packet.decode();

        expect(packet.avgFps).toBe(60);
        expect(packet.avgServerSimTickTimeMs).toBe(1.5);
        expect(packet.avgClientSimTickTimeMs).toBe(2.5);
        expect(packet.avgBeginFrameTimeMs).toBe(0.5);
        expect(packet.avgInputTimeMs).toBe(0.25);
        expect(packet.avgRenderTimeMs).toBe(8);
        expect(packet.avgEndFrameTimeMs).toBe(0.75);
        expect(packet.avgRemainderTimePercent).toBe(10);
        expect(packet.avgUnaccountedTimePercent).toBe(5);
        expect(packet.memoryCategoryValues).toEqual([{ category: 44, currentBytes: 4096n }]);
        expect(packet.entityDiagnostics).toEqual([
            {
                displayName: 'Zombie',
                entity: 'minecraft:zombie',
                timeInNs: 1000n,
                percentOfTotal: 50,
                position: new Vector3(1, 64, -3),
                dimension: 'overworld'
            }
        ]);
        expect(packet.systemDiagnostics).toEqual([
            { displayName: 'Physics', systemIndex: 7n, timeInNs: 2000n, percentOfTotal: 25 }
        ]);
        expect(packet.systemCategories).toEqual([{ categoryName: 'Simulation', systemIndex: 7n }]);
        expect(packet.whiskerScopes).toEqual([
            { label: 'tick', indentation: '  ', totalHighCostNs: 3n, totalMidCostNs: 2n, totalLowCostNs: 1n }
        ]);
        expect(packet.feof()).toBe(true);
    });

    it('decodes empty lists as five zero counts', () => {
        const buffer = Buffer.concat([header, Buffer.alloc(9 * 4), Buffer.from([0, 0, 0, 0, 0])]);
        const packet = new ServerboundDiagnosticsPacket(buffer);
        packet.decode();

        expect(packet.memoryCategoryValues).toEqual([]);
        expect(packet.whiskerScopes).toEqual([]);
        expect(packet.feof()).toBe(true);
    });

    it('encodes what it decodes', () => {
        const packet = new ServerboundDiagnosticsPacket();
        packet.avgFps = 30;
        packet.systemCategories = [{ categoryName: 'A', systemIndex: 1n }];
        packet.encode();

        const expected = Buffer.concat([
            header,
            f32(30),
            Buffer.alloc(8 * 4),
            Buffer.from([0, 0, 0, 0x01]),
            str('A'),
            u64(1n),
            Buffer.from([0])
        ]);
        expect(packet.getBuffer()).toEqual(expected);
    });
});
