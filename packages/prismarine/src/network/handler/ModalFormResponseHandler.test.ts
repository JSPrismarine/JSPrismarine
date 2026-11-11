import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { sessionContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type PlayerSession from '../PlayerSession';
import ModalFormResponsePacket, { ModalFormCancelReason } from '@jsprismarine/protocol/packet/ModalFormResponsePacket';
import ModalFormResponseHandler from './ModalFormResponseHandler';

const fakeSession = () => {
    const debug: string[] = [];
    const warn: string[] = [];
    const log = stub<Logger>({
        debug: (...message) => void debug.push(message[0] ?? ''),
        warn: (...message) => void warn.push(message[0] ?? '')
    });
    const session = stub<PlayerSession>({ identity: STEVE });

    return { debug, warn, context: sessionContext(session, { log }) };
};

describe('ModalFormResponseHandler', () => {
    it('logs the JSON of a submitted form', () => {
        const { debug, warn, context } = fakeSession();
        const packet = Object.assign(new ModalFormResponsePacket(), { formId: 4, jsonResponse: 'true' });

        new ModalFormResponseHandler().handle(packet, context);

        expect(debug).toEqual(['Steve submitted true form 4, which the server never sent']);
        expect(warn).toEqual([]);
    });

    it('logs the reason of a dismissed form', () => {
        const { debug, context } = fakeSession();
        const packet = Object.assign(new ModalFormResponsePacket(), {
            formId: 4,
            formCancelReason: ModalFormCancelReason.UserBusy
        });

        new ModalFormResponseHandler().handle(packet, context);

        expect(debug).toEqual(['Steve dismissed (UserBusy) form 4, which the server never sent']);
    });

    it('falls back to the raw number for a cancel reason it does not know', () => {
        const { debug, context } = fakeSession();
        const packet = Object.assign(new ModalFormResponsePacket(), { formId: 4, formCancelReason: 9 });

        new ModalFormResponseHandler().handle(packet, context);

        expect(debug).toEqual(['Steve dismissed (9) form 4, which the server never sent']);
    });

    it('warns and drops a response whose text is not JSON', () => {
        const { debug, warn, context } = fakeSession();
        const packet = Object.assign(new ModalFormResponsePacket(), { formId: 4, jsonResponse: '{not json' });

        expect(() => new ModalFormResponseHandler().handle(packet, context)).not.toThrow();
        expect(warn).toEqual(['Steve answered form 4 with text that is not JSON, dropped']);
        expect(debug).toEqual([]);
    });

    it('logs a response that carries neither JSON nor a reason', () => {
        const { debug, context } = fakeSession();
        const packet = Object.assign(new ModalFormResponsePacket(), { formId: 4 });

        new ModalFormResponseHandler().handle(packet, context);

        expect(debug).toEqual([
            'Steve answered with neither a response nor a reason form 4, which the server never sent'
        ]);
    });
});
