import { describe, expect, it } from 'vitest';

import type { EntityRuntime } from '../../entity/data/EntityRuntime';
import type PlayerSession from '../../player/PlayerSession';
import type { SessionPlayer } from '../../player/sessionPlayers';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import JumpHandler from './JumpHandler';

describe('JumpHandler', () => {
    it('records the jump on the player', () => {
        const player = stub<SessionPlayer>({});
        const jumped: unknown[] = [];
        const session = stub<PlayerSession>({
            getPlayer: () => player,
            inputs: () => stub<EntityRuntime>({ playerJumped: (target) => void jumped.push(target) })
        });

        new JumpHandler().handle({ kind: 'jump' }, inputContext(session).context);

        expect(jumped).toEqual([player]);
    });
});
