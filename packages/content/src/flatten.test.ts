import { describe, expect, it } from 'vitest';

import { flatten, FlattenError } from './flatten';

interface BlockType {
    runtimeId: number;
    friction?: number;
    lightEmission?: number;
    blastResistance?: number;
}

const blocks: BlockType[] = [
    { runtimeId: 0, friction: 0.6, lightEmission: 0, blastResistance: 6 },
    { runtimeId: 1, friction: 0.989, lightEmission: 0, blastResistance: 3 },
    { runtimeId: 2, friction: 0.6, lightEmission: 15, blastResistance: -1 }
];

const columns = {
    friction: { kind: 'f32', read: (block: BlockType) => block.friction },
    light: { kind: 'u8', read: (block: BlockType) => block.lightEmission },
    blastResistance: { kind: 'i32', read: (block: BlockType) => block.blastResistance }
} as const;

describe('flatten', () => {
    it('writes each column into the typed array its spec declares', () => {
        const table = flatten(blocks, { id: (block) => block.runtimeId, length: 3, columns });

        expect(table.friction).toBeInstanceOf(Float32Array);
        expect(table.light).toBeInstanceOf(Uint8Array);
        expect(table.blastResistance).toBeInstanceOf(Int32Array);
        expect(table.friction[1]).toBeCloseTo(0.989, 6);
        expect([...table.light]).toEqual([0, 0, 15]);
        expect([...table.blastResistance]).toEqual([6, 3, -1]);

        // @ts-expect-error the friction column is a Float32Array, as its kind declares
        const wrong: Uint8Array = table.friction;
        void wrong;
    });

    it('fills an id no source covers from the column default', () => {
        const table = flatten(blocks, {
            id: (block) => block.runtimeId,
            length: 5,
            columns: { light: { kind: 'u8', read: (block: BlockType) => block.lightEmission, default: 0 } }
        });

        expect([...table.light]).toEqual([0, 0, 15, 0, 0]);
    });

    it('fails on an id with no value, no default and no exception', () => {
        expect(() =>
            flatten(blocks, {
                id: (block) => block.runtimeId,
                length: 4,
                columns: { light: { kind: 'u8', read: (block: BlockType) => block.lightEmission } }
            })
        ).toThrow(/light.*3|3.*light/);
    });

    it('accepts a reviewed exception for one column of one id', () => {
        const table = flatten(blocks, {
            id: (block) => block.runtimeId,
            length: 4,
            columns: { light: { kind: 'u8', read: (block: BlockType) => block.lightEmission } },
            exceptions: [
                { id: 3, column: 'light', value: 7, reason: 'minecraft:unknown has no Java counterpart to read' }
            ]
        });

        expect([...table.light]).toEqual([0, 0, 15, 7]);
    });

    it('accepts an exception that covers every column of one id', () => {
        const table = flatten(blocks, {
            id: (block) => block.runtimeId,
            length: 4,
            columns,
            exceptions: [{ id: 3, value: 0, reason: 'the reserved id the palette never resolves' }]
        });

        expect(table.friction[3]).toBe(0);
        expect(table.light[3]).toBe(0);
        expect(table.blastResistance[3]).toBe(0);
    });

    it('fails on an exception that matched nothing, so the list cannot rot', () => {
        expect(() =>
            flatten(blocks, {
                id: (block) => block.runtimeId,
                length: 3,
                columns,
                exceptions: [{ id: 2, column: 'light', value: 7, reason: 'fixed upstream in 1.26.51' }]
            })
        ).toThrow(/fixed upstream in 1\.26\.51/);
    });

    it('fails when two sources claim one id', () => {
        expect(() =>
            flatten([...blocks, { runtimeId: 1 }], {
                id: (block) => block.runtimeId,
                length: 3,
                columns: { light: { kind: 'u8', read: (block: BlockType) => block.lightEmission ?? 0 } }
            })
        ).toThrow(FlattenError);
    });

    it('fails on an id outside the declared length', () => {
        expect(() =>
            flatten(blocks, {
                id: (block) => block.runtimeId,
                length: 2,
                columns: { light: { kind: 'u8', read: (block: BlockType) => block.lightEmission } }
            })
        ).toThrow(/2/);
    });

    it('fails on a value the column cannot hold instead of truncating it', () => {
        expect(() =>
            flatten([{ runtimeId: 0, lightEmission: 300 }], {
                id: (block: BlockType) => block.runtimeId,
                length: 1,
                columns: { light: { kind: 'u8', read: (block: BlockType) => block.lightEmission } }
            })
        ).toThrow(/300/);
    });

    it('fails on a fractional value in an integer column', () => {
        expect(() =>
            flatten([{ runtimeId: 0, lightEmission: 0.5 }], {
                id: (block: BlockType) => block.runtimeId,
                length: 1,
                columns: { light: { kind: 'u8', read: (block: BlockType) => block.lightEmission } }
            })
        ).toThrow(/0\.5/);
    });
});
