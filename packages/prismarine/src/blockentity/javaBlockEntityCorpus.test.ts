/**
 * The content translation against every block entity Java 26.3 actually ships.
 *
 * `javaBlockEntityContent.test.ts` states what each type should become, one compound at a time.
 * This reads the real templates instead and runs the whole corpus through, which is the check
 * that catches the compound nobody thought to write a case for: a banner on a block the color
 * cannot be read off, a stack naming an item the mapping has no row for, a list tag where a
 * compound was expected.
 *
 * It needs the extracted Java structure templates, which `pnpm --filter
 * @jsprismarine/bedrock-data run fetch:sources` leaves in `node_modules/.cache/jsprismarine`.
 * Without them there is nothing to read and the suite skips.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';
import { readJavaStructureTemplate } from '@jsprismarine/structures/javaTemplate';
import { describe, expect, it } from 'vitest';

import { applyJavaBlockEntityContent } from './javaBlockEntityContent';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));

/** The newest extracted template set the fetch left on disk, when there is one. */
const templateRoot = (): string | undefined => {
    const extracted = join(repoRoot, 'node_modules/.cache/jsprismarine/java-structures');
    if (!existsSync(extracted)) return undefined;

    const versions = readdirSync(extracted).sort();
    const newest = versions.at(-1);
    return newest === undefined ? undefined : join(extracted, newest);
};

const everyTemplateFile = (directory: string, found: string[] = []): string[] => {
    for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) everyTemplateFile(path, found);
        else if (path.endsWith('.nbt')) found.push(path);
    }
    return found;
};

/** A compound after the round trip through the network encoding a client reads. */
const onTheWire = (tags: NBTTagCompound): NBTTagCompound => {
    const out = new BinaryStream();
    const writer = new NBTWriter(out, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(true);
    writer.writeCompound(tags);

    const reader = new NBTReader(new BinaryStream(out.getBuffer()), ByteOrder.LITTLE_ENDIAN);
    reader.setUseVarint(true);
    return reader.parse();
};

/** One translated block entity, with the Java type and block it came from. */
interface Translated {
    readonly javaType: string;
    readonly javaBlock: string;
    readonly bedrock: NBTTagCompound;
    /** The tags the translation added, which is everything but the position. */
    readonly added: readonly string[];
}

/**
 * Every block entity of every template, translated.
 *
 * The jigsaws and the structure blocks are left out, as the placement leaves them out: a jigsaw
 * is replaced by its final state before a chunk ever sees it, and a structure block in DATA mode
 * is a marker the piece reads and discards.
 */
const translateCorpus = (root: string): Translated[] => {
    const out: Translated[] = [];

    for (const file of everyTemplateFile(root)) {
        const template = readJavaStructureTemplate(readFileSync(file));
        for (const block of template.blocks) {
            if (block.nbt === undefined) continue;

            const javaType = block.nbt.getString('id', '');
            if (javaType === 'minecraft:jigsaw' || javaType === 'minecraft:structure_block') continue;

            const javaBlock = template.palette[block.state]?.name ?? '';
            const bedrock = new NBTTagCompound('');
            bedrock.addValue('x', new Types.NumberVal(0));
            bedrock.addValue('y', new Types.NumberVal(64));
            bedrock.addValue('z', new Types.NumberVal(0));
            applyJavaBlockEntityContent(bedrock, block.nbt, { javaBlock });

            const settled = onTheWire(bedrock);
            const added = [...settled.children.keys()].filter((key) => key !== 'x' && key !== 'y' && key !== 'z');
            out.push({ javaType, javaBlock, bedrock: settled, added });
        }
    }

    return out;
};

const root = templateRoot();

describe.skipIf(root === undefined)('the Java 26.3 structure template corpus', () => {
    const corpus = root === undefined ? [] : translateCorpus(root);
    const of = (javaType: string): Translated[] => corpus.filter((entry) => entry.javaType === javaType);
    const withContent = (javaType: string): Translated[] => of(javaType).filter((entry) => entry.added.length > 0);

    it('reads the whole corpus and translates every block entity in it', () => {
        expect(corpus.length).toBe(1124);
        expect(corpus.filter((entry) => entry.added.length > 0)).toHaveLength(149);
    });

    it('survives the network encoding for every one of them', () => {
        // `translateCorpus` encodes and decodes each compound, so arriving here at all is the
        // assertion; what is checked is that nothing was silently emptied on the way.
        expect(corpus.filter((entry) => entry.bedrock.children.size < 3)).toEqual([]);
    });

    it('gives all 107 banners a base color, and only the raid banners a type', () => {
        const banners = of('minecraft:banner');

        expect(banners).toHaveLength(107);
        expect(banners.filter((entry) => !entry.bedrock.has('Base'))).toEqual([]);
        expect(banners.filter((entry) => entry.bedrock.has('Type'))).toHaveLength(16);
        expect(banners.filter((entry) => entry.bedrock.has('Patterns'))).toHaveLength(11);
    });

    it('takes a brown wall banner down to Bedrock index 3', () => {
        const brown = of('minecraft:banner').filter((entry) => entry.javaBlock === 'minecraft:brown_wall_banner');

        expect(brown).toHaveLength(77);
        expect(new Set(brown.map((entry) => entry.bedrock.getNumber('Base', -1)))).toEqual(new Set([3]));
    });

    it('writes no banner layer it has no Bedrock code for', () => {
        for (const banner of of('minecraft:banner')) {
            for (const layer of banner.bedrock.getList('Patterns', false) ?? []) {
                expect((layer as NBTTagCompound).getString('Pattern', '')).not.toBe('');
            }
        }
    });

    it('gives every sign two faces, and the village signpost its arrows', () => {
        const signs = of('minecraft:sign');

        expect(signs).toHaveLength(5);
        expect(signs.filter((entry) => !entry.bedrock.has('FrontText') || !entry.bedrock.has('BackText'))).toEqual([]);

        const written = signs
            .map((entry) => entry.bedrock.getCompound('FrontText', false)?.getString('Text', '') ?? '')
            .filter((text) => text !== '');
        expect(written).toEqual(['\n<----\n---->']);
    });

    it('presses four sherds into every decorated pot, the decorated face first', () => {
        const pots = of('minecraft:decorated_pot');

        expect(pots).toHaveLength(5);
        for (const pot of pots) {
            const sherds = Array.from(pot.bedrock.getList('sherds', false) ?? [], (value: Types.StringVal) =>
                value.getValue()
            );
            expect(sherds).toHaveLength(4);
            expect(sherds.filter((name) => name === '')).toEqual([]);
        }

        // Four of the five press one sherd into the back and bricks elsewhere; the fifth has its
        // flow sherd on the front, which is the last entry of the list rather than the first.
        expect(
            pots.filter(
                (pot) => Array.from(pot.bedrock.getList('sherds', false) ?? [])[0]?.getValue() !== 'minecraft:brick'
            )
        ).toHaveLength(3);
    });

    it('gives both vaults their key and their reward table inside the config', () => {
        const vaults = of('minecraft:vault');

        expect(vaults).toHaveLength(2);
        expect(
            vaults.map((entry) => entry.bedrock.getCompound('config', false)?.getString('loot_table', '')).sort()
        ).toEqual([
            'loot_tables/chests/trial_chambers/reward.json',
            'loot_tables/chests/trial_chambers/reward_ominous.json'
        ]);
        expect(
            vaults
                .map((entry) =>
                    entry.bedrock.getCompound('config', false)?.getCompound('key_item', false)?.getString('Name', '')
                )
                .sort()
        ).toEqual(['minecraft:ominous_trial_key', 'minecraft:trial_key']);
    });

    it('names the mob both monster spawners carry', () => {
        expect(
            of('minecraft:mob_spawner')
                .map((entry) => entry.bedrock.getString('EntityIdentifier', ''))
                .sort()
        ).toEqual(['minecraft:magma_cube', 'minecraft:spider']);
    });

    it('fills the nine containers the templates stocked by hand', () => {
        const stocked = corpus.filter((entry) => entry.bedrock.has('Items'));

        expect(stocked).toHaveLength(9);
        expect(new Set(stocked.map((entry) => entry.javaType))).toEqual(
            new Set([
                'minecraft:chest',
                'minecraft:trapped_chest',
                'minecraft:dispenser',
                'minecraft:furnace',
                'minecraft:brewing_stand'
            ])
        );
    });

    it('leaves the 14 trial spawners without a resolver to inline their configurations', () => {
        const spawners = of('minecraft:trial_spawner');

        expect(spawners).toHaveLength(14);
        expect(withContent('minecraft:trial_spawner')).toEqual([]);
    });

    it('finds nothing to translate on the types the census says carry nothing', () => {
        for (const javaType of [
            'minecraft:bell',
            'minecraft:campfire',
            'minecraft:lectern',
            'minecraft:sculk_sensor',
            'minecraft:skull',
            'minecraft:ender_chest',
            'minecraft:copper_golem_statue',
            'minecraft:creaking_heart',
            'minecraft:brushable_block'
        ]) {
            expect(withContent(javaType)).toEqual([]);
        }
    });
});
