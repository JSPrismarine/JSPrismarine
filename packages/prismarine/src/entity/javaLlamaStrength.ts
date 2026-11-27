/**
 * Java's llama strength chances, written into the `randomize` that draws a llama's strength
 * group as each entity file loads.
 *
 * Java's `Llama.setRandomStrength` caps the draw at 5 one time in 25 and at 3 otherwise, then
 * rolls `1 + nextInt(cap)`: 32.8 percent each for strengths 1 to 3 and 0.8 percent each for 4
 * and 5. Bedrock's pack weighs them 32, 32, 32, 2 and 2. Strength sizes the llama's chest, which
 * the server decides, so Java's chances decide
 * ([ADR 0001](../../../../docs/adr/0001-entity-stat-authority.md)).
 *
 * @javaSee Llama.setRandomStrength
 */
import { isRecord } from '../utils/isRecord';

/** The group a branch adds for one strength, `minecraft:strength_<n>`. */
const STRENGTH_GROUP = /^minecraft:strength_(\d+)$/;

/** `Llama.setRandomStrength`'s chance of the wider cap. */
const WIDE_CAP_CHANCE = 0.04;

/** The cap the draw usually rolls under, and the wider one. */
const NARROW_CAP = 3;
const WIDE_CAP = 5;

/**
 * The chance Java gives a llama of one strength.
 *
 * @param strength - The strength, 1 to 5.
 * @returns The share of llamas Java spawns with it.
 */
export const javaLlamaStrengthChance = (strength: number): number =>
    (strength >= 1 && strength <= NARROW_CAP ? (1 - WIDE_CAP_CHANCE) / NARROW_CAP : 0) +
    (strength >= 1 && strength <= WIDE_CAP ? WIDE_CAP_CHANCE / WIDE_CAP : 0);

/** The whole-number weight that gives each strength its Java chance: 41 of 125 for 1 to 3, 1 for 4 and 5. */
const WEIGHT_SCALE = 125;

/** The strength a `randomize` branch draws, when it adds one strength group and nothing else. */
const strengthOf = (branch: unknown): number | undefined => {
    const add = isRecord(branch) ? branch['add'] : undefined;
    const groups = isRecord(add) ? add['component_groups'] : undefined;
    if (!Array.isArray(groups) || groups.length !== 1 || typeof groups[0] !== 'string') return undefined;
    const match = STRENGTH_GROUP.exec(groups[0]);
    return match?.[1] === undefined ? undefined : Number(match[1]);
};

/** Rewrites every `randomize` under an event node whose branches all draw a strength. */
const rewritten = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(rewritten);
    if (!isRecord(node)) return node;
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) copy[key] = rewritten(value);
    const randomize = copy['randomize'];
    if (
        Array.isArray(randomize) &&
        randomize.length > 0 &&
        randomize.every((branch) => strengthOf(branch) !== undefined)
    )
        copy['randomize'] = randomize.map((branch) => ({
            ...branch,
            weight: Math.round(javaLlamaStrengthChance(strengthOf(branch) ?? 0) * WEIGHT_SCALE)
        }));
    return copy;
};

/**
 * Applies Java's strength chances to one entity file in the shape a behavior pack writes.
 *
 * @param data - The parsed JSON of an entity file.
 * @returns The same object for a file with no events; otherwise a copy whose strength draws
 *   carry Java's weights.
 */
export const withJavaLlamaStrength = (data: unknown): unknown => {
    if (!isRecord(data)) return data;
    const entity = data['minecraft:entity'];
    if (!isRecord(entity) || !isRecord(entity['events'])) return data;
    return { ...data, 'minecraft:entity': { ...entity, events: rewritten(entity['events']) } };
};
