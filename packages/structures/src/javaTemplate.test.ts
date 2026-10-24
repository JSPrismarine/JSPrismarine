import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { byte, compound, doubleTriple, encodeBigEndian, int, intTriple, list, str } from '../test/nbtFixtures';
import { PALETTE_KEY_RENAME_DATA_VERSION, readJavaStructureTemplate } from './javaTemplate';
import { StructureFormatError } from './types';

const oldSpellingTemplate = () =>
    compound({
        size: intTriple(2, 1, 3),
        palette: list(
            compound({ Name: str('minecraft:stone_bricks') }),
            compound({ Name: str('minecraft:ladder'), Properties: compound({ facing: str('north') }) })
        ),
        blocks: list(
            compound({ pos: intTriple(0, 0, 0), state: int(0) }),
            compound({
                pos: intTriple(1, 0, 2),
                state: int(1),
                nbt: compound({ id: str('minecraft:chest'), LootTable: str('minecraft:chests/igloo_chest') })
            })
        ),
        entities: list(
            compound({
                pos: doubleTriple(0.5, 1, 2.5),
                blockPos: intTriple(0, 1, 2),
                nbt: compound({ id: str('minecraft:villager') })
            })
        ),
        DataVersion: int(3442),
        author: str('Searge')
    });

const newSpellingTemplate = () =>
    compound({
        size: intTriple(1, 1, 1),
        palette: list(compound({ id: str('minecraft:oak_stairs'), properties: compound({ facing: str('east') }) })),
        blocks: list(compound({ pos: intTriple(0, 0, 0), state: int(0) })),
        entities: list(),
        DataVersion: int(PALETTE_KEY_RENAME_DATA_VERSION)
    });

describe('readJavaStructureTemplate', () => {
    it('reads size, palette, blocks and entities from the pre-26.3 key spelling', () => {
        const template = readJavaStructureTemplate(encodeBigEndian(oldSpellingTemplate()));

        expect(template.size).toEqual([2, 1, 3]);
        expect(template.paletteKeySpelling).toBe('Name');
        expect(template.palette).toEqual([
            { name: 'minecraft:stone_bricks', properties: {} },
            { name: 'minecraft:ladder', properties: { facing: 'north' } }
        ]);
        expect(template.blocks.map((block) => [block.pos, block.state])).toEqual([
            [[0, 0, 0], 0],
            [[1, 0, 2], 1]
        ]);
        expect(template.blocks[1]?.nbt?.getString('LootTable', '')).toBe('minecraft:chests/igloo_chest');
        expect(template.entities).toHaveLength(1);
        expect(template.entities[0]?.pos).toEqual([0.5, 1, 2.5]);
        expect(template.entities[0]?.blockPos).toEqual([0, 1, 2]);
        expect(template.entities[0]?.nbt?.getString('id', '')).toBe('minecraft:villager');
        expect(template.dataVersion).toBe(3442);
        expect(template.author).toBe('Searge');
    });

    it('reads the 26.3 id and properties key spelling', () => {
        const template = readJavaStructureTemplate(encodeBigEndian(newSpellingTemplate()));

        expect(template.paletteKeySpelling).toBe('id');
        expect(template.palette).toEqual([{ name: 'minecraft:oak_stairs', properties: { facing: 'east' } }]);
    });

    it('reads gzip-compressed bytes, which is how both corpora ship', () => {
        const raw = encodeBigEndian(oldSpellingTemplate());

        expect(readJavaStructureTemplate(gzipSync(raw))).toEqual(readJavaStructureTemplate(raw));
    });

    it('probes the key spelling when the file carries version instead of DataVersion', () => {
        const bytes = encodeBigEndian(
            compound({
                size: intTriple(1, 1, 1),
                palette: list(compound({ Name: str('minecraft:snow') })),
                blocks: list(compound({ pos: intTriple(0, 0, 0), state: int(0) })),
                entities: list(),
                version: int(1),
                author: str('Searge')
            })
        );

        const template = readJavaStructureTemplate(bytes);

        expect(template.version).toBe(1);
        expect(template.dataVersion).toBeUndefined();
        expect(template.paletteKeySpelling).toBe('Name');
        expect(template.palette).toEqual([{ name: 'minecraft:snow', properties: {} }]);
    });

    it('reads the new spelling even when DataVersion says the file should use the old one', () => {
        const bytes = encodeBigEndian(
            compound({
                size: intTriple(1, 1, 1),
                palette: list(compound({ id: str('minecraft:snow') })),
                blocks: list(compound({ pos: intTriple(0, 0, 0), state: int(0) })),
                entities: list(),
                DataVersion: int(3442)
            })
        );

        expect(readJavaStructureTemplate(bytes).paletteKeySpelling).toBe('id');
    });

    it('keeps every variant of a randomized palettes list', () => {
        const bytes = encodeBigEndian(
            compound({
                size: intTriple(1, 1, 1),
                palettes: list(
                    list(compound({ id: str('minecraft:mud_bricks') })),
                    list(compound({ id: str('minecraft:packed_mud') }))
                ),
                blocks: list(compound({ pos: intTriple(0, 0, 0), state: int(0) })),
                entities: list(),
                DataVersion: int(5023)
            })
        );

        const template = readJavaStructureTemplate(bytes);

        expect(template.paletteVariants).toHaveLength(2);
        expect(template.paletteVariants?.[1]).toEqual([{ name: 'minecraft:packed_mud', properties: {} }]);
        expect(template.palette).toEqual(template.paletteVariants?.[0]);
    });

    it('reports bytes that are not a structure template', () => {
        expect(() => readJavaStructureTemplate(Uint8Array.from([1, 2, 3]))).toThrow(StructureFormatError);
        expect(() => readJavaStructureTemplate(encodeBigEndian(compound({ size: intTriple(1, 1, 1) })))).toThrow(
            /no palette/
        );
        expect(() =>
            readJavaStructureTemplate(encodeBigEndian(compound({ size: list(int(1), int(1)), palette: list() })))
        ).toThrow(/expected size to be three numbers/);
    });

    it('reports a palette entry with no block identifier', () => {
        const bytes = encodeBigEndian(
            compound({
                size: intTriple(1, 1, 1),
                palette: list(compound({ id: str('minecraft:stone') }), compound({ unrelated: byte(1) })),
                blocks: list(),
                entities: list(),
                DataVersion: int(5023)
            })
        );

        expect(() => readJavaStructureTemplate(bytes)).toThrow(/palette entry 1 has no block identifier/);
    });
});
