import type { EnchantmentDefinition } from './definition';
import type { EnchantmentRegistry } from './registry';

/**
 * The one vanilla Java enchantment with no Bedrock counterpart. 42 of Java's
 * 43 map; this one is on `@jsprismarine/mapping`'s reviewed loss list.
 */
export const SWEEPING_EDGE = 'minecraft:sweeping_edge';

/**
 * Translates one Java enchantment id to its Bedrock id, or returns undefined
 * when Bedrock has none. Adapt `javaIdentifierToBedrock('enchantment', id)`
 * from `@jsprismarine/mapping` to this shape; this package stays unaware that
 * two editions exist.
 */
export type EnchantmentIdentifierMapper = (enchantment: string) => string | undefined;

/** One enchantment on a stack, seen from the client's side. */
export interface BedrockEnchantmentProjection {
    /** Namespaced Java enchantment id. */
    readonly enchantment: string;
    readonly level: number;
    /** The Bedrock id, or undefined when the client cannot be told about this enchantment. */
    readonly bedrock: string | undefined;
    /** The lore line to send instead, set only when `bedrock` is undefined. */
    readonly lore: string | undefined;
}

/** What to send a Bedrock client for one stack's enchantments. */
export interface BedrockProjectionResult {
    readonly entries: readonly BedrockEnchantmentProjection[];
    /**
     * Whether the server has to force the enchanted glint. A Bedrock client
     * draws the glint from the enchantments it was told about, so a stack
     * whose enchantments are all server-side would otherwise look plain.
     */
    readonly forceGlint: boolean;
}

/**
 * The Roman numerals vanilla's language file defines, as
 * `enchantment.level.1` through `enchantment.level.10`.
 */
const LEVEL_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const;

/**
 * The level suffix both editions print after an enchantment name. Vanilla
 * translates levels 1 through 10 and has no key for anything else, so a level
 * outside that range prints as a plain number here rather than as a numeral
 * no client would show.
 */
export const romanNumeral = (level: number): string => LEVEL_NUMERALS[Math.trunc(level) - 1] ?? String(level);

/** How a projection names an enchantment the client cannot represent. */
export interface BedrockProjectionOptions {
    /**
     * Builds the lore line for an enchantment with no Bedrock id. The default
     * writes the enchantment id and its level, because resolving
     * `description` needs a translation table this package does not have.
     */
    readonly lore?: (enchantment: EnchantmentDefinition | undefined, id: string, level: number) => string;
}

const defaultLore = (_definition: EnchantmentDefinition | undefined, id: string, level: number): string =>
    `${id} ${romanNumeral(level)}`;

/**
 * Works out what a Bedrock client can be told about a stack's enchantments.
 *
 * What the client cannot be told matters more than what it can. A Bedrock
 * client only knows the enchantments its own registry lists, so
 * `sweeping_edge` and every datapack enchantment arrive as nothing at all. The
 * server still runs their mechanics, because every effect component in this
 * package resolves server-side and reaches the world through an effect sink;
 * the client just never learns why the numbers moved. The
 * honest substitute is the one vanilla Bedrock itself has no better answer
 * for: a lore line naming the enchantment, and a glint the server forces on.
 *
 * Consequences worth stating plainly. A player sees the lore line but gets no
 * tooltip ordering, no enchantment-specific tooltip color, and nothing in the
 * creative or anvil interfaces that recognizes it. An anvil or enchanting
 * table interaction is decided on the server, so the client's own preview is
 * wrong whenever a server-side enchantment is involved and the server has to
 * send the result rather than let the client compute it.
 *
 * @param levels - Enchantment id to level, as the `minecraft:enchantments` component holds it.
 */
export const projectToBedrock = (
    registry: EnchantmentRegistry,
    levels: ReadonlyMap<string, number>,
    mapper: EnchantmentIdentifierMapper,
    options: BedrockProjectionOptions = {}
): BedrockProjectionResult => {
    const lore = options.lore ?? defaultLore;

    const entries = [...levels].map(([enchantment, level]) => {
        const bedrock = mapper(enchantment);
        return {
            enchantment,
            level,
            bedrock,
            lore: bedrock === undefined ? lore(registry.get(enchantment), enchantment, level) : undefined
        };
    });

    return {
        entries,
        forceGlint: entries.length > 0 && entries.every((entry) => entry.bedrock === undefined)
    };
};
