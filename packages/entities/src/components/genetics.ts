import type { ComponentFactory } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';

import type { EntityHooks } from '../hooks';
import type { RandomSource } from '../filterContext';
import { asList, isRecord, numberAt, stringAt } from './schemas';
import type { SensorTrigger } from './shared';
import { parseComponentTrigger } from './shared';

/** An allele value or an inclusive range of them, as a genetic variant matches one. */
export interface AlleleRange {
    readonly min: number;
    readonly max: number;
}

/** One variant a gene can express, and the event an entity born with it raises. */
export interface GeneticVariant {
    readonly mainAllele?: AlleleRange;
    readonly hiddenAllele?: AlleleRange;
    readonly bothAllele?: AlleleRange;
    readonly birthEvent?: SensorTrigger;
}

/** One gene: the alleles it draws from and the variants they express. */
export interface Gene {
    readonly name: string;
    readonly alleles: AlleleRange;
    readonly variants: readonly GeneticVariant[];
}

/** What `minecraft:genetics` declares. */
export interface GeneticsParams {
    readonly genes: readonly Gene[];
}

/** Reads `range_min`/`range_max`, or a single allele value. */
const rangeOf = (value: unknown): AlleleRange | undefined => {
    if (typeof value === 'number') return { min: value, max: value };
    if (!isRecord(value)) return undefined;
    const min = numberAt(value, 'range_min', Number.NaN);
    const max = numberAt(value, 'range_max', Number.NaN);
    return Number.isInteger(min) && Number.isInteger(max) && min <= max ? { min, max } : undefined;
};

const within = (range: AlleleRange | undefined, allele: number): boolean =>
    range === undefined || (allele >= range.min && allele <= range.max);

/** Draws one allele uniformly from a gene's inclusive range. */
const drawAllele = (range: AlleleRange, random: RandomSource): number => {
    const span = range.max - range.min + 1;
    const draw = random.nextInt?.(span) ?? Math.floor(random.next() * span);
    return range.min + Math.min(span - 1, Math.max(0, draw));
};

/**
 * The first variant a pair of alleles expresses: each of its main, hidden and both-allele
 * conditions has to hold, and a condition it leaves out holds for any allele.
 */
export const expressedVariant = (gene: Gene, main: number, hidden: number): GeneticVariant | undefined =>
    gene.variants.find(
        (variant) =>
            within(variant.mainAllele, main) &&
            within(variant.hiddenAllele, hidden) &&
            within(variant.bothAllele, main) &&
            within(variant.bothAllele, hidden)
    );

/**
 * `minecraft:genetics`, which the goat and the panda carry: a spawned entity draws a main and a
 * hidden allele for each gene and raises the birth event of the variant they express, which is
 * what makes a goat a screamer or a panda lazy, worried, playful, aggressive, weak or brown.
 *
 * Inheritance from parents is not carried out; a bred entity draws its alleles the same way.
 */
export const genetics: ComponentFactory<EntityHooks, GeneticsParams> = {
    name: 'minecraft:genetics',
    hooks: ['onInitialize'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const genes: Gene[] = [];
        for (const [index, raw] of asList(value.genes).entries()) {
            if (!isRecord(raw)) return rejected(`genes[${index}] must be an object`);
            const alleles = rangeOf(raw.allele_range);
            if (alleles === undefined) return rejected(`genes[${index}].allele_range must name a range`);
            const variants: GeneticVariant[] = [];
            for (const entry of asList(raw.genetic_variants)) {
                if (!isRecord(entry)) continue;
                const mainAllele = rangeOf(entry.main_allele);
                const hiddenAllele = rangeOf(entry.hidden_allele);
                const bothAllele = rangeOf(entry.both_allele);
                const birthEvent = parseComponentTrigger(entry.birth_event);
                variants.push({
                    ...(mainAllele === undefined ? {} : { mainAllele }),
                    ...(hiddenAllele === undefined ? {} : { hiddenAllele }),
                    ...(bothAllele === undefined ? {} : { bothAllele }),
                    ...(birthEvent === undefined ? {} : { birthEvent })
                });
            }
            genes.push({ name: stringAt(raw, 'name') ?? `gene_${index}`, alleles, variants });
        }
        return accepted({ genes });
    },
    create: (params) => ({
        onInitialize: (entity) => {
            // A saved entity already expressed its genes when it was first spawned.
            if (entity.restoring) return;
            for (const gene of params.genes) {
                const main = drawAllele(gene.alleles, entity.random);
                const hidden = drawAllele(gene.alleles, entity.random);
                const trigger = expressedVariant(gene, main, hidden)?.birthEvent;
                if (trigger?.event !== undefined) entity.raise(trigger.event, trigger.target, 'minecraft:genetics');
            }
        }
    })
};
