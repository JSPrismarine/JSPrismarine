import type { Logger } from '@jsprismarine/logger';
import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type PlayerSession from '../../player/PlayerSession';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type { World } from '../../world/World';
import AttackEntityHandler from './AttackEntityHandler';
import InteractEntityHandler from './InteractEntityHandler';
import UseItemHandler from './UseItemHandler';

/** A player in `gamemode` whose world tracks no actor, and every lookup and line it logs. */
const scene = (gamemode: Gametype) => {
    const looked: bigint[] = [];
    const logged: string[] = [];
    const world = stub<World>({
        getActor: (runtimeId) => {
            looked.push(runtimeId);
            return null;
        }
    });
    const session = stub<PlayerSession>({
        identity: identityNamed('tester'),
        getWorld: () => world,
        getPlayer: () => stubPlayerPort({ gamemode })
    });
    const { context } = inputContext(session, {
        log: stub<Logger>({ verbose: (...message) => void logged.push(String(message[0])) })
    });
    return { context, looked, logged };
};

describe('AttackEntityHandler', () => {
    it('drops a swing at a runtime id the world does not track, at verbose level', () => {
        const { context, looked, logged } = scene(Gametype.SURVIVAL);

        new AttackEntityHandler().handle({ kind: 'attackEntity', target: 12n }, context);

        expect(looked).toEqual([12n]);
        expect(logged).toEqual(['tester swung at runtime id 12, which is not an entity here']);
    });
});

describe('the entity and item use handlers', () => {
    it('let a spectator touch nothing, whichever edition sent the use', () => {
        const { context, looked, logged } = scene(Gametype.SPECTATOR);

        new AttackEntityHandler().handle({ kind: 'attackEntity', target: 12n }, context);
        new InteractEntityHandler().handle({ kind: 'interactEntity', target: 12n }, context);
        new UseItemHandler().handle({ kind: 'useItem', held: false }, context);

        expect(looked).toEqual([]);
        expect(logged).toEqual([]);
    });
});
