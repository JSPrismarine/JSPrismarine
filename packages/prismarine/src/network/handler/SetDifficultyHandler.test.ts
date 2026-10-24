import { Difficulty } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import SetDifficultyPacket from '../packet/SetDifficultyPacket';
import SetDifficultyHandler from './SetDifficultyHandler';

describe('SetDifficultyHandler', () => {
    it('logs the requested difficulty by name', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new SetDifficultyPacket(), { difficulty: Difficulty.EASY });

        new SetDifficultyHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve asked for difficulty EASY, which the server does not change']);
    });
});
