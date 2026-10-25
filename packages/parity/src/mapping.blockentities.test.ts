import { BLOCK_ENTITY_CONTENT_LOSSES } from '@jsprismarine/mapping';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { applyJavaBlockEntityContent } from '@jsprismarine/prismarine/blockentity/javaBlockEntityContent';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';

/**
 * What a Java block entity's contents lose on the way into the Bedrock block entity.
 *
 * `blockentity/javaBlockEntityContent.ts` translates a banner's color and layers, a sign's two
 * faces, a decorated pot's sherds, a vault's key, a spawner's mob and every container's stacks.
 * `BLOCK_ENTITY_CONTENT_LOSSES` in `@jsprismarine/mapping` declares the six fields it does not,
 * each because Bedrock has nowhere to put it, and the allow-list rows come from that declaration
 * rather than a second copy here.
 *
 * Each row is measured by translating a block entity that carries the field and looking for it
 * on the Bedrock side. A field that arrives is a loss that has been closed, which makes the row
 * stale and fails this family rather than passing unnoticed. A field that does not arrive and is
 * not declared is an unexpected gap, which fails it the other way.
 *
 * Gap id: `loss:<java block entity type>/<field>`.
 */

/** A block entity carrying one field, and how to tell whether that field reached Bedrock. */
interface Probe {
    /** The row this probe measures, as `<java type>/<field>`. */
    readonly row: string;
    /** The Java block entity, carrying the field under test. */
    readonly java: () => NBTTagCompound;
    /** Whatever else the translation needs, which only the banner's block name is. */
    readonly javaBlock?: string;
    /** Whether the field reached the Bedrock compound in any form. */
    readonly arrived: (bedrock: NBTTagCompound) => boolean;
}

const str = (value: string): Types.StringVal => new Types.StringVal(value);
const int = (value: number): Types.NumberVal => new Types.NumberVal(value);

const compound = (name: string, entries: Readonly<Record<string, unknown>>): NBTTagCompound => {
    const nbt = new NBTTagCompound(name);
    for (const [key, value] of Object.entries(entries)) {
        if (value instanceof NBTTagCompound) nbt.addChild(value);
        else nbt.addValue(key, value);
    }
    return nbt;
};

/** Every tag of a compound and of the compounds under it, flattened to one set of names. */
const everyTagName = (nbt: NBTTagCompound, into = new Set<string>()): Set<string> => {
    for (const [key, value] of nbt.children) {
        into.add(key);
        if (value instanceof NBTTagCompound) everyTagName(value, into);
        if (value instanceof Set) {
            for (const entry of value) if (entry instanceof NBTTagCompound) everyTagName(entry, into);
        }
    }
    return into;
};

const PROBES: readonly Probe[] = [
    {
        row: 'minecraft:sign/allow_op_features',
        java: () =>
            compound('', {
                id: str('minecraft:sign'),
                allow_op_features: new Types.ByteVal(1),
                front_text: compound('front_text', { messages: new Set([compound('', { text: str('hi') })]) })
            }),
        // Bedrock signs run no click events, so there is no tag of any name to find.
        arrived: (bedrock) => everyTagName(bedrock).has('allow_op_features')
    },
    {
        row: 'minecraft:sign/filtered_messages',
        java: () =>
            compound('', {
                id: str('minecraft:sign'),
                front_text: compound('front_text', {
                    messages: new Set([compound('', { text: str('rude') })]),
                    filtered_messages: new Set([compound('', { text: str('####') })])
                })
            }),
        arrived: (bedrock) => (bedrock.getCompound('FrontText', false)?.getString('Text', '') ?? '').includes('####')
    },
    {
        row: 'minecraft:furnace/RecipesUsed',
        java: () =>
            compound('', {
                id: str('minecraft:furnace'),
                RecipesUsed: compound('RecipesUsed', { 'minecraft:deepslate': int(24) })
            }),
        arrived: (bedrock) => everyTagName(bedrock).has('RecipesUsed')
    },
    {
        row: 'minecraft:trial_spawner/normal_config',
        java: () =>
            compound('', {
                id: str('minecraft:trial_spawner'),
                normal_config: str('minecraft:trial_chamber/breeze/normal')
            }),
        arrived: (bedrock) => bedrock.has('normal_config')
    },
    {
        row: 'minecraft:banner/patterns',
        java: () =>
            compound('', {
                id: str('minecraft:banner'),
                patterns: new Set([compound('', { pattern: str('example:spiral'), color: str('red') })])
            }),
        javaBlock: 'minecraft:white_wall_banner',
        arrived: (bedrock) => bedrock.has('Patterns')
    },
    {
        row: 'minecraft:brewing_stand/Items[].components.minecraft:potion_contents',
        java: () =>
            compound('', {
                id: str('minecraft:brewing_stand'),
                Items: new Set([
                    compound('', {
                        id: str('minecraft:potion'),
                        count: int(1),
                        Slot: new Types.ByteVal(0),
                        components: compound('components', {
                            'minecraft:potion_contents': compound('minecraft:potion_contents', {
                                potion: str('minecraft:strong_healing')
                            })
                        })
                    })
                ])
            }),
        // A named potion reaches Bedrock as a data value on the stack; a plain bottle is 0.
        arrived: (bedrock) =>
            Array.from(bedrock.getList('Items', false) ?? []).some(
                (stack) => stack instanceof NBTTagCompound && stack.getShort('Damage', 0) !== 0
            )
    }
];

/** The rows whose field did not reach the Bedrock block entity, as gap ids. */
const compareBlockEntityContent = (): string[] =>
    PROBES.filter((probe) => {
        const bedrock = new NBTTagCompound('');
        applyJavaBlockEntityContent(bedrock, probe.java(), { javaBlock: probe.javaBlock });
        return !probe.arrived(bedrock);
    }).map((probe) => `loss:${probe.row}`);

describeFamily(FAMILIES.mappingBlockEntities, [REFERENCES.javaIdentifierCensus], () => {
    const verdict = checkAllowList(FAMILIES.mappingBlockEntities, compareBlockEntityContent());

    it('loses nothing out of a block entity that is not on the reviewed list', () => {
        expect(verdict.unexpected).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        // A field that arrives now is a loss somebody closed, and its row belongs off the list.
        expect(verdict.stale).toEqual([]);
    });

    it('probes every declared loss, so none of them goes unmeasured', () => {
        expect(PROBES.map((probe) => probe.row).sort()).toEqual(
            BLOCK_ENTITY_CONTENT_LOSSES.map((loss) => `${loss.javaType}/${loss.field}`).sort()
        );
    });
});
