/**
 * A world double over a real entity runtime, for a test of one store actor.
 *
 * The runtime is the fixture content's Overworld runtime, so a saved actor or a dropped stack
 * comes back into a real store and is shown through a real actor. The world answers only what an
 * actor and the runtime read of it, and names the dimension an actor is saved for.
 */
import type Server from '../Server';
import type { LiveEntityRuntime } from '../entity/data/live';
import { Dimensions } from '../world/Dimension';
import type { DimensionType } from '../world/Dimension';
import type { World } from '../world/World';
import { liveTestEntities, testEntityServer } from './entityServer';
import { stub } from './stub.test.helper';

/** The world, its server and the runtime its actors belong to. */
export interface StoreWorld {
    readonly world: World;
    readonly server: Server;
    readonly live: LiveEntityRuntime;
}

/** @param dimension - The dimension the world says it is. */
export const storeWorld = (dimension: DimensionType = Dimensions.Overworld): StoreWorld => {
    let world: World | undefined;
    const entities = liveTestEntities(() => world);
    const live = entities.entityRuntime(Dimensions.Overworld.name);
    const server = testEntityServer({ entityRuntime: live, content: entities.content() });
    world = stub<World>({
        getName: () => dimension.name,
        getServer: () => server,
        getDimension: () => dimension,
        showActor: async () => {},
        hideActor: async () => {},
        storeEntityChunkChanged: () => {}
    });
    return { world, server, live };
};
