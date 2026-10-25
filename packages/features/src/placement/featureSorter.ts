/**
 * Java's `FeatureSorter`, which fixes the order a decoration step's features run in.
 *
 * Each biome lists its features per step in its own order, and several biomes list the same
 * feature. Java merges those orders into one list per step that every biome agrees with, then
 * uses a feature's position in that list as the index `setFeatureSeed` consumes. The merge is a
 * depth-first topological sort over the edges "this biome runs A immediately before B", so the
 * index of a feature depends on the whole dimension's biome list rather than on the chunk.
 */

/** One feature of one step, the node the sort walks. Java's `FeatureSorter.FeatureData`. */
interface FeatureNode {
    /** The decoration step the biome listed the feature in. */
    readonly step: number;
    /** The order the reference was first seen in, across every biome and every step. */
    readonly featureIndex: number;
    /** The placed feature's identifier. */
    readonly reference: string;
}

/** Java's `Comparator.comparingInt(step).thenComparingInt(featureIndex)`. */
const compareNodes = (a: FeatureNode, b: FeatureNode): number =>
    a.step === b.step ? a.featureIndex - b.featureIndex : a.step - b.step;

/**
 * Merges every biome's per-step feature order into one order per step.
 *
 * @param biomeFeatures - One entry per biome, each a list indexed by decoration step of the
 * placed feature identifiers that biome runs in that step, in the biome's own order.
 * @returns One list per step, deduplicated and ordered. A feature's position in its step's list
 * is the index that seeds it, so two biomes that share a feature seed it identically. The result
 * has as many steps as the longest input, which may be fewer than the eleven Java defines.
 * @throws Error when two biomes order the same pair of features opposite ways, which leaves no
 * order that satisfies both. Java fails the same way, with `Feature order cycle found`.
 */
export const sortFeaturesPerStep = (
    biomeFeatures: Iterable<readonly (readonly string[])[]>
): readonly (readonly string[])[] => {
    const featureIndices = new Map<string, number>();
    const nodes = new Map<string, FeatureNode>();
    const successors = new Map<FeatureNode, FeatureNode[]>();
    let stepCount = 0;

    for (const steps of biomeFeatures) {
        stepCount = Math.max(stepCount, steps.length);

        // The biome's own features flattened across its steps. Java draws an edge from each
        // entry to the next one, including across a step boundary; the step is part of the node
        // identity, so those edges never reorder a step against another.
        const chain: FeatureNode[] = [];
        for (let step = 0; step < steps.length; step++) {
            for (const reference of steps[step] ?? []) {
                const featureIndex = featureIndices.get(reference) ?? featureIndices.size;
                featureIndices.set(reference, featureIndex);

                const key = `${step},${featureIndex}`;
                const existing = nodes.get(key);
                const node = existing ?? { step, featureIndex, reference };
                if (existing === undefined) nodes.set(key, node);
                chain.push(node);
            }
        }

        for (let position = 0; position < chain.length; position++) {
            const node = chain[position];
            if (node === undefined) continue;

            const following = successors.get(node) ?? [];
            successors.set(node, following);

            const next = chain[position + 1];
            if (next !== undefined && !following.includes(next)) following.push(next);
        }
    }

    for (const following of successors.values()) following.sort(compareNodes);
    const roots = [...successors.keys()].sort(compareNodes);

    const finished = new Set<FeatureNode>();
    const visiting = new Set<FeatureNode>();
    const ordered: FeatureNode[] = [];

    /** @returns Whether the walk reached a node it is already inside, meaning a cycle. */
    const visit = (node: FeatureNode): boolean => {
        if (finished.has(node)) return false;
        if (visiting.has(node)) return true;

        visiting.add(node);
        for (const next of successors.get(node) ?? []) {
            if (visit(next)) return true;
        }

        visiting.delete(node);
        finished.add(node);
        ordered.push(node);
        return false;
    };

    for (const root of roots) {
        if (finished.has(root)) continue;
        if (visit(root)) {
            throw new Error(`Feature order cycle found, reached again at ${root.reference}`);
        }
    }

    // The walk appends a node once everything that must follow it has been appended, so the
    // order it builds is the reverse of the one the decoration pass wants.
    ordered.reverse();

    const perStep: string[][] = [];
    for (let step = 0; step < stepCount; step++) perStep.push([]);
    for (const node of ordered) perStep[node.step]?.push(node.reference);
    return perStep;
};
