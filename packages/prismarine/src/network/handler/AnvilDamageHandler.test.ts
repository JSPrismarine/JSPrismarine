import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import BlockPosition from '../../world/BlockPosition';
import type PlayerSession from '../PlayerSession';
import AnvilDamagePacket from '../packet/AnvilDamagePacket';
import AnvilDamageHandler from './AnvilDamageHandler';

describe('AnvilDamageHandler', () => {
    it('logs the anvil position', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new AnvilDamagePacket(), { blockPosition: new BlockPosition(-1, 70, 2) });

        new AnvilDamageHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve asked to damage the anvil at -1, 70, 2. Anvils are not modeled']);
    });
});
