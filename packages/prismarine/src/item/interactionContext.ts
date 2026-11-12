import { AsyncLocalStorage } from 'node:async_hooks';

const dimension = new AsyncLocalStorage<string>();

/** Runs item queries and effects in the dimension that authorized the interaction. */
export const duringItemInteraction = <T>(initiatingDimension: string, body: () => T): T =>
    dimension.run(initiatingDimension, body);

/** Reads the initiating dimension, including inside nested behavior dispatches. */
export const itemInteractionDimension = (): string | undefined => dimension.getStore();
