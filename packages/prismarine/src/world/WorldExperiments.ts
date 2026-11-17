/**
 * The Bedrock world experiments a level can turn on.
 *
 * Bedrock keeps a world's experiments in `level.dat`, as a compound of toggles under `experiments`,
 * and sends the ones that are on to each client in `ResourcePacksStack` and `StartGame`, by the same
 * ids. An experiment stays on once a world has it: the game offers no way to turn one off again.
 */

/**
 * The experiments JSPrismarine implements, by the id `level.dat` and the join packets use.
 * `gametest` is the experiment Minecraft's world settings call Beta APIs, which a behavior pack
 * script needs to declare a beta Script API module.
 */
export const WORLD_EXPERIMENTS = ['gametest'] as const;

/** One of {@link WORLD_EXPERIMENTS}. */
export type WorldExperiment = (typeof WORLD_EXPERIMENTS)[number];

/** The Beta APIs experiment. */
export const BETA_APIS: WorldExperiment = 'gametest';

/** Whether a toggle name is an experiment JSPrismarine implements. */
export const isWorldExperiment = (name: string): name is WorldExperiment =>
    WORLD_EXPERIMENTS.some((experiment) => experiment === name);

/**
 * The experiments a level runs with: the ones its `worlds.<name>` entry lists and the ones its
 * `level.dat` already has on, so a world from Bedrock Dedicated Server keeps its toggles.
 *
 * @returns Each experiment once, in {@link WORLD_EXPERIMENTS} order.
 */
export const levelExperiments = (
    configured: readonly WorldExperiment[] | undefined,
    saved: readonly WorldExperiment[] | undefined
): WorldExperiment[] => {
    const on = new Set([...(configured ?? []), ...(saved ?? [])]);
    return WORLD_EXPERIMENTS.filter((experiment) => on.has(experiment));
};

/** One toggle as `ResourcePacksStack` and `StartGame` carry it. */
export interface ExperimentToggle {
    readonly name: string;
    readonly enabled: boolean;
}

/** The toggles the join packets send for a level's experiments: each one that is on. */
export const experimentToggles = (experiments: readonly WorldExperiment[]): ExperimentToggle[] =>
    experiments.map((name) => ({ name, enabled: true }));
