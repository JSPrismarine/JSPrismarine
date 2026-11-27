import { describe, expect, it } from 'vitest';

import { DisconnectReason } from '@jsprismarine/minecraft';
import type { Logger } from '@jsprismarine/logger';
import type { ScriptFormResponse } from '@jsprismarine/script-host/host/world';
import ModalFormResponsePacket, {
    ModalFormCancelReason
} from '@jsprismarine/protocol/bedrock/packet/ModalFormResponsePacket';
import { inputContext } from '../../../testing/handlerContext.test.helper';
import { stub } from '../../../testing/stub.test.helper';
import { STEVE } from '../../../testing/sessionIdentity.test.helper';
import type PlayerSession from '../../../player/PlayerSession';
import ModalFormResponseHandler, { MALFORMED_FORM_RESPONSE } from './ModalFormResponseHandler';

/** A session whose answers go to scripts that take them, or to none when `scripts` is false. */
const fakeSession = (scripts = true) => {
    const debug: string[] = [];
    const answers: ScriptFormResponse[] = [];
    const kicks: string[] = [];
    const log = stub<Logger>({ debug: (...message) => void debug.push(message[0] ?? '') });
    const session = stub<PlayerSession>({
        identity: STEVE,
        getRuntimeId: () => 7n,
        kick: async (reason = '', code) => void kicks.push(`${code} ${reason}`)
    });
    const { context } = inputContext(session, {
        log,
        services: {
            scriptForms: {
                answerForm: (response) => {
                    answers.push(response);
                    return scripts;
                },
                answerDataDriven: () => scripts
            }
        }
    });
    return { debug, answers, kicks, context };
};

describe('ModalFormResponseHandler', () => {
    it("hands a submitted form's JSON to the scripts under the player's script id", () => {
        const { answers, debug, context } = fakeSession();
        const packet = Object.assign(new ModalFormResponsePacket(), { formId: 4, jsonResponse: '[true]' });

        new ModalFormResponseHandler().handle(packet, context);

        expect(answers).toEqual([{ player: '7', formId: 4, response: '[true]', cancelReason: null }]);
        expect(debug).toEqual([]);
    });

    it('hands a dismissed form to the scripts with its reason', () => {
        const { answers, context } = fakeSession();
        const packet = Object.assign(new ModalFormResponsePacket(), {
            formId: 4,
            formCancelReason: ModalFormCancelReason.UserBusy
        });

        new ModalFormResponseHandler().handle(packet, context);

        expect(answers).toEqual([{ player: '7', formId: 4, response: null, cancelReason: 1 }]);
    });

    it('logs an answer when no scripts run', () => {
        const { debug, context } = fakeSession(false);
        const packet = Object.assign(new ModalFormResponsePacket(), { formId: 4, formCancelReason: 9 });

        new ModalFormResponseHandler().handle(packet, context);

        expect(debug).toEqual(['Steve dismissed (9) form 4, which no script sent']);
    });

    it('disconnects a client whose answer is not JSON, as BDS does, and hands the scripts nothing', () => {
        const { answers, kicks, context } = fakeSession();
        const packet = Object.assign(new ModalFormResponsePacket(), { formId: 4, jsonResponse: '[1' });

        expect(() => new ModalFormResponseHandler().handle(packet, context)).not.toThrow();
        expect(kicks).toEqual([`${DisconnectReason.BAD_PACKET} ${MALFORMED_FORM_RESPONSE}`]);
        expect(answers).toEqual([]);
    });
});
