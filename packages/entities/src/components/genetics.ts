import type { ComponentFactory } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';

import { defineComponentState, stateField } from '../componentState';
import type { EntityInstance } from '../entityInstance';
import type { EntityHooks } from '../hooks';
import type { RandomSource } from '../filterContext';
import { nextInt } from '../randomInt';
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
    /** The chance each inherited allele is drawn afresh instead. */
    readonly mutationRate: number;
}

/** The main and hidden allele each gene holds, in the order the definition lists the genes. */
const GENETICS_STATE = defineComponentState('minecraft:genetics', {
    main: stateField.list(stateField.number),
    hidden: stateField.list(stateField.number)
});

/**
 * Java Edition's `Panda.Gene.getRandom`, one gene per `nextInt(16)` draw. Bedrock's panda writes
 * a different table over its alleles (four weak draws in sixteen where Java has five, six normal
 * where Java has five), and the gene decides the panda's behavior, which the server runs.
 */
const JAVA_PANDA_GENES = [
    'lazy',
    'worried',
    'playful',
    'weak',
    'aggressive',
    'weak',
    'weak',
    'weak',
    'weak',
    'brown',
    'brown',
    'normal',
    'normal',
    'normal',
    'normal',
    'normal'
] as const;

/**
 * The allele of a gene that, held as both main and hidden allele, expresses the named panda gene:
 * the variant whose birth event ends in the name, or no variant for `normal`. Bedrock and Java
 * express a pair the same way: a dominant main allele shows, a recessive one (weak, brown) only
 * when both alleles match.
 */
const pandaAllele = (gene: Gene, name: string): number | undefined => {
    for (let allele = gene.alleles.min; allele <= gene.alleles.max; allele++) {
        const event = expressedVariant(gene, allele, allele)?.birthEvent?.event;
        if (name === 'normal' ? event === undefined : event?.endsWith(`_${name}`) === true) return allele;
    }
    return undefined;
};

/** How a vanilla type draws a gene and passes it on, where Java's rule differs from Bedrock's. */
interface JavaGeneRule {
    /** Java's draw for a spawned entity, as an allele; absent draws uniformly, as Bedrock does. */
    readonly draw?: (gene: Gene, random: RandomSource) => number | undefined;
    /**
     * Absent, the bred entity follows Java's `Panda.setGeneFromParents`, which is also Bedrock's
     * documented rule: one allele from each parent, then a mutation chance on each. Present, it
     * follows `Goat.getBreedOffspring`: one parent, picked at random, passes on its alleles when
     * they express a birth event this names, and otherwise the kid draws afresh.
     */
    readonly passedOn?: (birthEvent: string) => boolean;
}

const JAVA_GENE_RULES: Readonly<Record<string, JavaGeneRule>> = {
    'minecraft:panda': {
        draw: (gene, random) => {
            const name = JAVA_PANDA_GENES[nextInt(random, JAVA_PANDA_GENES.length)];
            return name === undefined ? undefined : pandaAllele(gene, name);
        }
    },
    // Java's Goat.finalizeSpawn screams on nextDouble() < 0.02, which a uniform draw over
    // Bedrock's 100 alleles, two of them a screamer's, already is.
    'minecraft:goat': { passedOn: (birthEvent) => birthEvent === 'minecraft:born_screamer' }
};

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

/** Java's `RandomSource.nextBoolean`. */
const nextBoolean = (random: RandomSource): boolean => random.next() < 0.5;

/** Draws one allele for a spawned entity: Java's draw for a vanilla type, else uniform over the range. */
const drawAllele = (gene: Gene, random: RandomSource, rule: JavaGeneRule | undefined): number =>
    rule?.draw?.(gene, random) ?? gene.alleles.min + nextInt(random, gene.alleles.max - gene.alleles.min + 1);

/** One gene's alleles, main first. */
type AllelePair = readonly [main: number, hidden: number];

/** The alleles a parent holds for the gene at an index, when it carries them. */
const allelesOf = (parent: EntityInstance, index: number): AllelePair | undefined => {
    const state = parent.componentState.get(GENETICS_STATE);
    const main = state?.main[index];
    const hidden = state?.hidden[index];
    return main === undefined || hidden === undefined ? undefined : [main, hidden];
};

/**
 * The alleles a bred entity takes for one gene from its parents, or undefined when a parent
 * carries none to pass on.
 */
const inheritedAlleles = (
    gene: Gene,
    index: number,
    parents: readonly EntityInstance[],
    params: GeneticsParams,
    random: RandomSource,
    rule: JavaGeneRule | undefined
): AllelePair | undefined => {
    const [first, second = first] = parents;
    if (first === undefined || second === undefined) return undefined;
    const father = allelesOf(first, index);
    const mother = allelesOf(second, index);
    if (father === undefined || mother === undefined) return undefined;

    if (rule?.passedOn !== undefined) {
        // Goat.getBreedOffspring: nextBoolean picks the parent, which passes on a scream it shows.
        const [main, hidden] = nextBoolean(random) ? father : mother;
        const event = expressedVariant(gene, main, hidden)?.birthEvent?.event;
        if (event !== undefined && rule.passedOn(event)) return [main, hidden];
        return [drawAllele(gene, random, rule), drawAllele(gene, random, rule)];
    }

    // Panda.setGeneFromParents: nextBoolean orders the parents, getOneOfGenesRandomly takes the
    // main or hidden allele of each, and each result mutates on its own roll.
    const oneOf = (pair: AllelePair): number => (nextBoolean(random) ? pair[0] : pair[1]);
    let main: number;
    let hidden: number;
    if (nextBoolean(random)) {
        main = oneOf(father);
        hidden = oneOf(mother);
    } else {
        main = oneOf(mother);
        hidden = oneOf(father);
    }
    if (random.next() < params.mutationRate) main = drawAllele(gene, random, rule);
    if (random.next() < params.mutationRate) hidden = drawAllele(gene, random, rule);
    return [main, hidden];
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
 * A bred entity takes its alleles from its parents instead. The alleles are kept, so a parent
 * passes on the ones it was born with.
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
        return accepted({ genes, mutationRate: numberAt(value, 'mutation_rate', 0) });
    },
    create: (params) => ({
        onInitialize: (entity) => {
            // A saved entity already expressed its genes when it was first spawned.
            if (entity.restoring) return;
            const rule = JAVA_GENE_RULES[entity.type.identifier];
            const main: number[] = [];
            const hidden: number[] = [];
            for (const [index, gene] of params.genes.entries()) {
                const [mainAllele, hiddenAllele] = inheritedAlleles(
                    gene,
                    index,
                    entity.parents,
                    params,
                    entity.random,
                    rule
                ) ?? [drawAllele(gene, entity.random, rule), drawAllele(gene, entity.random, rule)];
                main.push(mainAllele);
                hidden.push(hiddenAllele);
                const trigger = expressedVariant(gene, mainAllele, hiddenAllele)?.birthEvent;
                if (trigger?.event !== undefined) entity.raise(trigger.event, trigger.target, 'minecraft:genetics');
            }
            entity.componentState.set(GENETICS_STATE, { main, hidden });
        }
    })
};
