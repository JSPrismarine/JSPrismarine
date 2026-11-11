import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import { sessionContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type PlayerSession from '../PlayerSession';
import ServerSettingsRequestPacket from '@jsprismarine/protocol/packet/ServerSettingsRequestPacket';
import ServerSettingsRequestHandler from './ServerSettingsRequestHandler';

describe('ServerSettingsRequestHandler', () => {
    it('answers nothing, rather than reapplying the adventure settings', () => {
        const logged: string[] = [];
        const settingsSent: unknown[] = [];
        const log = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });
        const session = stub<PlayerSession>({
            identity: STEVE,
            sendSettings: async (player) => void settingsSent.push(player)
        });

        new ServerSettingsRequestHandler().handle(new ServerSettingsRequestPacket(), sessionContext(session, { log }));

        expect(settingsSent).toEqual([]);
        expect(logged).toEqual(['Steve asked for the server settings form, which the server does not offer']);
    });
});
