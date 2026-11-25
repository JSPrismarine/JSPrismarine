import { describe, expect, it } from 'vitest';

import type { EntityRuntime } from '../../entity/data/EntityRuntime';
import type PlayerSession from '../../player/PlayerSession';
import type { SessionPlayer } from '../../player/sessionPlayers';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import SetSneakingHandler from './SetSneakingHandler';

describe('SetSneakingHandler', () => {
    it('sets the sneak on the player', () => {
        const player = stub<SessionPlayer>({});
        const sneaks: boolean[] = [];
        const session = stub<PlayerSession>({
            getPlayer: () => player,
            inputs: () => stub<EntityRuntime>({ setPlayerSneaking: (_target, sneaking) => void sneaks.push(sneaking) })
        });
        const { context } = inputContext(session);

        new SetSneakingHandler().handle({ kind: 'setSneaking', sneaking: true }, context);
        new SetSneakingHandler().handle({ kind: 'setSneaking', sneaking: false }, context);

        expect(sneaks).toEqual([true, false]);
    });
});
