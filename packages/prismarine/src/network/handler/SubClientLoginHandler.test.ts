import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import SubClientLoginPacket from '../packet/SubClientLoginPacket';
import SubClientLoginHandler from './SubClientLoginHandler';

describe('SubClientLoginHandler', () => {
    it('logs the refusal and reads nothing out of the login blob', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new SubClientLoginPacket(), { chainData: '{}', clientData: 'x' });

        new SubClientLoginHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve tried to add a split screen player, which the server does not support']);
    });
});
