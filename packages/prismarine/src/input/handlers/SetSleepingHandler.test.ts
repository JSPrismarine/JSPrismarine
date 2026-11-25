import { Attributes } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';
import { describe, expect, it } from 'vitest';

import { PlayerComponents } from '../../entity/playerComponents';
import type PlayerSession from '../../player/PlayerSession';
import type { SessionPlayer } from '../../player/sessionPlayers';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import SetSleepingHandler from './SetSleepingHandler';

describe('SetSleepingHandler', () => {
    it('sets whether the player sleeps', () => {
        const components = new PlayerComponents(new Attributes(Attributes.getPlayerDefaults()), () => {});
        const session = stub<PlayerSession>({
            getPlayer: () => stub<SessionPlayer>({ getComponents: () => components })
        });
        const { context } = inputContext(session);

        new SetSleepingHandler().handle({ kind: 'setSleeping', sleeping: true }, context);
        expect(components.get('movement.sleeping')).toBe(true);

        new SetSleepingHandler().handle({ kind: 'setSleeping', sleeping: false }, context);
        expect(components.get('movement.sleeping')).toBe(false);
    });
});
