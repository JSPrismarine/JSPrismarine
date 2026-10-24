import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import ModalFormResponsePacket, { ModalFormCancelReason } from '../packet/ModalFormResponsePacket';
import ModalFormResponseHandler from './ModalFormResponseHandler';

const fakeSession = () => {
    const logged: string[] = [];
    const server = stub<Server>({
        getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
    });
    const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });

    return { logged, server, session };
};

describe('ModalFormResponseHandler', () => {
    it('logs the JSON of a submitted form', () => {
        const { logged, server, session } = fakeSession();
        const packet = Object.assign(new ModalFormResponsePacket(), { formId: 4, jsonResponse: 'true' });

        new ModalFormResponseHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve submitted true form 4, which the server never sent']);
    });

    it('logs the reason of a dismissed form', () => {
        const { logged, server, session } = fakeSession();
        const packet = Object.assign(new ModalFormResponsePacket(), {
            formId: 4,
            formCancelReason: ModalFormCancelReason.UserClosed
        });

        new ModalFormResponseHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve dismissed (UserClosed) form 4, which the server never sent']);
    });
});
