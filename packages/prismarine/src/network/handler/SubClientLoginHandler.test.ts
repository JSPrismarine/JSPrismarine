import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';
import { sessionContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type PlayerSession from '../PlayerSession';
import SubClientLoginPacket from '@jsprismarine/protocol/packet/SubClientLoginPacket';
import SubClientLoginHandler from './SubClientLoginHandler';

describe('SubClientLoginHandler', () => {
    it('logs the refusal and reads nothing out of the login blob', () => {
        const logged: string[] = [];
        const log = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });
        const session = stub<PlayerSession>({ identity: STEVE });
        const packet = new SubClientLoginPacket({ chainData: '{}', clientData: 'x' });

        new SubClientLoginHandler().handle(packet, sessionContext(session, { log }));

        expect(logged).toEqual(['Steve tried to add a split screen player, which the server does not support']);
    });
});
