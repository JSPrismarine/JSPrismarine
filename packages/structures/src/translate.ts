import type { BlockLoss } from '@jsprismarine/mapping';
import { javaBlockStateToBedrock } from '@jsprismarine/mapping';

import type {
    BedrockBlockState,
    BedrockStructureTemplate,
    BedrockTemplateBlock,
    JavaBlockState,
    JavaStructureTemplate
} from './types';
import { NO_BLOCK } from './types';

/** Why one Java palette entry did not translate into a plain Bedrock state. */
export type TemplateLossKind =
    /** The mapping has a reviewed loss row for the block. */
    | 'reviewed'
    /** The identifier, property or value is not part of Java 26.3. */
    | 'unknown'
    /** A non-`minecraft:` identifier the mapping passed through untouched. */
    | 'passthrough';

/** One Java palette entry that the translation could not map cleanly. */
export interface TemplateTranslationLoss {
    /** The entry's index in the Java template palette. */
    readonly paletteIndex: number;
    readonly javaState: JavaBlockState;
    readonly kind: TemplateLossKind;
    /** The mapping's reviewed loss row, present when `kind` is `reviewed`. */
    readonly loss?: BlockLoss;
    /** How many blocks of the template use this palette entry. */
    readonly blockCount: number;
}

/** A translated template with the full account of what the translation cost. */
export interface TranslatedTemplate {
    /** The Bedrock-shaped template, which is what the server places. */
    readonly template: BedrockStructureTemplate;
    /** One row per Java palette entry that did not map cleanly, in palette order. */
    readonly losses: readonly TemplateTranslationLoss[];
    /** Blocks whose palette entry mapped cleanly. */
    readonly mappedBlocks: number;
    /** Blocks whose palette entry produced a {@link TemplateTranslationLoss}. */
    readonly lostBlocks: number;
}

/** How to translate one Java template. */
export interface TranslateOptions {
    /** Which variant of a randomized `palettes` list to use; defaults to the first. */
    readonly paletteVariant?: number;
    /**
     * Whether a Java `waterlogged=true` state puts water on Bedrock's second
     * block layer, which is where that information goes. Defaults to true.
     */
    readonly applyWaterlogging?: boolean;
}

const UNKNOWN_BLOCK: BedrockBlockState = { name: 'minecraft:unknown', states: {} };

// Asked of the mapping rather than written down, so the water state stays the
// one the pinned Bedrock palette declares.
const waterResult = javaBlockStateToBedrock('minecraft:water', { level: '0' });
const WATER: BedrockBlockState = waterResult.kind === 'unknown' ? UNKNOWN_BLOCK : waterResult.bedrock;

const keyOf = (state: BedrockBlockState): string => {
    const states = Object.keys(state.states)
        .sort()
        .map((key) => `${key}=${state.states[key]}`)
        .join(',');
    return `${state.name}|${states}`;
};

/** Collects distinct Bedrock states into a palette, returning each one's index. */
class PaletteBuilder {
    public readonly palette: BedrockBlockState[] = [];
    private readonly indices = new Map<string, number>();

    public indexOf(state: BedrockBlockState): number {
        const key = keyOf(state);
        const existing = this.indices.get(key);
        if (existing !== undefined) return existing;
        const index = this.palette.length;
        this.palette.push(state);
        this.indices.set(key, index);
        return index;
    }
}

/** What one Java palette entry became: a Bedrock state and, where it lost something, why. */
interface TranslatedEntry {
    readonly bedrock: BedrockBlockState;
    readonly kind: TemplateLossKind | 'mapped';
    readonly loss?: BlockLoss;
}

const translateState = (state: JavaBlockState): TranslatedEntry => {
    const result = javaBlockStateToBedrock(state.name, state.properties);
    switch (result.kind) {
        case 'mapped':
            return { bedrock: result.bedrock, kind: 'mapped' };
        case 'loss':
            return { bedrock: result.bedrock, kind: 'reviewed', loss: result.loss };
        case 'passthrough':
            return { bedrock: result.bedrock, kind: 'passthrough' };
        case 'unknown':
            return { bedrock: UNKNOWN_BLOCK, kind: 'unknown' };
    }
};

/**
 * Translates a Java template's palette into Bedrock block states through
 * `@jsprismarine/mapping`, producing the Bedrock-shaped template the server
 * places.
 *
 * Nothing is dropped quietly: every palette entry that does not map cleanly
 * becomes a {@link TemplateTranslationLoss} with the number of blocks it
 * affects, and its blocks are still placed, as `minecraft:unknown` where the
 * mapping has no state at all. Java's `waterlogged` flag, which no Bedrock
 * state carries, moves to the second block layer as water.
 */
export const translateJavaTemplate = (
    template: JavaStructureTemplate,
    options: TranslateOptions = {}
): TranslatedTemplate => {
    const variant =
        options.paletteVariant === undefined
            ? template.palette
            : (template.paletteVariants?.[options.paletteVariant] ?? template.palette);
    const applyWaterlogging = options.applyWaterlogging ?? true;

    const blockCounts = new Array<number>(variant.length).fill(0);
    for (const block of template.blocks) {
        const count = blockCounts[block.state];
        if (count !== undefined) blockCounts[block.state] = count + 1;
    }

    const builder = new PaletteBuilder();
    const losses: TemplateTranslationLoss[] = [];
    const stateIndices: number[] = [];
    const extraIndices: number[] = [];

    for (const [paletteIndex, javaState] of variant.entries()) {
        const translated = translateState(javaState);
        stateIndices.push(builder.indexOf(translated.bedrock));
        extraIndices.push(
            applyWaterlogging && javaState.properties.waterlogged === 'true' ? builder.indexOf(WATER) : NO_BLOCK
        );
        if (translated.kind !== 'mapped') {
            losses.push({
                paletteIndex,
                javaState,
                kind: translated.kind,
                ...(translated.loss === undefined ? {} : { loss: translated.loss }),
                blockCount: blockCounts[paletteIndex] ?? 0
            });
        }
    }

    const lostEntries = new Set(losses.map((loss) => loss.paletteIndex));
    let mappedBlocks = 0;
    let lostBlocks = 0;
    const blocks: BedrockTemplateBlock[] = template.blocks.map((block) => {
        if (lostEntries.has(block.state)) lostBlocks++;
        else mappedBlocks++;
        return {
            pos: block.pos,
            state: stateIndices[block.state] ?? builder.indexOf(UNKNOWN_BLOCK),
            extraState: extraIndices[block.state] ?? NO_BLOCK,
            ...(block.nbt === undefined ? {} : { nbt: block.nbt })
        };
    });

    return {
        template: { size: template.size, palette: builder.palette, blocks, entities: template.entities },
        losses,
        mappedBlocks,
        lostBlocks
    };
};
