import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import ModalFormResponsePacket, { ModalFormCancelReason } from '@jsprismarine/protocol/packet/ModalFormResponsePacket';
import ModalFormResponseHandler from './ModalFormResponseHandler';

const fakeSession = () => {
    const debug: string[] = [];
    const warn: string[] = [];
    const server = stub<Server>({
        getLogger: () =>
            stub<Logger>({
                debug: (...message) => void debug.push(message[0] ?? ''),
                warn: (...message) => void warn.push(message[0] ?? '')
            })
    });
    const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });

    return { debug, warn, server, session };
};

describe('ModalFormResponseHandler', () => {
    it('logs the JSON of a submitted form', () => {
        const { debug, warn, server, session } = fakeSession();
        const packet = Object.assign(new ModalFormResponsePacket(), { formId: 4, jsonResponse: 'true' });

        new ModalFormResponseHandler().handle(packet, server, session);

        expect(debug).toEqual(['Steve submitted true form 4, which the server never sent']);
        expect(warn).toEqual([]);
    });

    it('logs the reason of a dismissed form', () => {
        const { debug, server, session } = fakeSession();
        const packet = Object.assign(new ModalFormResponsePacket(), {
            formId: 4,
            formCancelReason: ModalFormCancelReason.UserBusy
        });

        new ModalFormResponseHandler().handle(packet, server, session);

        expect(debug).toEqual(['Steve dismissed (UserBusy) form 4, which the server never sent']);
    });

    it('falls back to the raw number for a cancel reason it does not know', () => {
        const { debug, server, session } = fakeSession();
        const packet = Object.assign(new ModalFormResponsePacket(), { formId: 4, formCancelReason: 9 });

        new ModalFormResponseHandler().handle(packet, server, session);

        expect(debug).toEqual(['Steve dismissed (9) form 4, which the server never sent']);
    });

    it('warns and drops a response whose text is not JSON', () => {
        const { debug, warn, server, session } = fakeSession();
        const packet = Object.assign(new ModalFormResponsePacket(), { formId: 4, jsonResponse: '{not json' });

        expect(() => new ModalFormResponseHandler().handle(packet, server, session)).not.toThrow();
        expect(warn).toEqual(['Steve answered form 4 with text that is not JSON, dropped']);
        expect(debug).toEqual([]);
    });

    it('logs a response that carries neither JSON nor a reason', () => {
        const { debug, server, session } = fakeSession();
        const packet = Object.assign(new ModalFormResponsePacket(), { formId: 4 });

        new ModalFormResponseHandler().handle(packet, server, session);

        expect(debug).toEqual([
            'Steve answered with neither a response nor a reason form 4, which the server never sent'
        ]);
    });
});
