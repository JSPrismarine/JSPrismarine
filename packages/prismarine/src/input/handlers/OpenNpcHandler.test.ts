import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type { StoreActor } from '../../entity/data/storeActors';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type PlayerSession from '../../player/PlayerSession';
import OpenNpcHandler from './OpenNpcHandler';

const NPC = 20n;

/**
 * A survival player at the origin in a world that may hold the NPC `npcDistance` blocks along x.
 * Every log line is kept, so an open the handler should have refused shows up as a line.
 */
const fakeSession = (options: { npcDistance?: number } = {}) => {
    const logged: string[] = [];
    // Annotated, because the actor the world answers with holds a position back into it.
    const world: World = stub<World>({
        getActor: (runtimeId) =>
            runtimeId === NPC && options.npcDistance !== undefined
                ? stub<StoreActor>({ getPosition: () => new Position(options.npcDistance ?? 0, 0, 0, world) })
                : null
    });
    const player = stubPlayerPort({ gamemode: Gametype.SURVIVAL, getPosition: () => new Position(0, 0, 0, world) });
    const session = stub<PlayerSession>({
        identity: identityNamed('tester'),
        getPlayer: () => player,
        getWorld: () => world
    });
    const log = stub<Logger>({ debug: (...message) => void logged.push(String(message[0] ?? '')) });
    return { logged, context: inputContext(session, { log }).context };
};

describe('OpenNpcHandler', () => {
    it('drops an open for an actor that is not in the world', () => {
        const { logged, context } = fakeSession();

        new OpenNpcHandler().handle({ kind: 'openNpc', target: NPC }, context);

        expect(logged).toEqual([`Dropped an NPC open from tester: actor ${NPC} is not in their world`]);
    });

    it('drops an open for an actor out of reach', () => {
        const { logged, context } = fakeSession({ npcDistance: 10 });

        new OpenNpcHandler().handle({ kind: 'openNpc', target: NPC }, context);

        expect(logged).toEqual([`Dropped an NPC open from tester: actor ${NPC} is 10.0 away`]);
    });

    it('records an open within reach as unimplemented', () => {
        const { logged, context } = fakeSession({ npcDistance: 2 });

        expect(new OpenNpcHandler().handle({ kind: 'openNpc', target: NPC }, context)).toBeUndefined();

        expect(logged).toEqual([`tester opened NPC ${NPC}. NPC dialogue is not implemented`]);
    });
});
