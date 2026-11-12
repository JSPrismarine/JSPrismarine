import { AsyncLocalStorage } from 'node:async_hooks';

/** The world an item interaction started in. */
export interface ItemInteractionWorld {
    /** The namespaced dimension identifier. */
    readonly dimension: string;
    /** The level's name, or undefined for the default level. */
    readonly level: string | undefined;
}

const initiating = new AsyncLocalStorage<ItemInteractionWorld>();

/** Runs item queries and effects in the world that authorized the interaction. */
export const duringItemInteraction = <T>(world: ItemInteractionWorld, body: () => T): T => initiating.run(world, body);

/** Reads the initiating world, including inside nested behavior dispatches. */
export const itemInteractionWorld = (): ItemInteractionWorld | undefined => initiating.getStore();
