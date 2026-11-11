import { describe, expect, it } from 'vitest';

import { inputContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import SettingsCommandPacket from '@jsprismarine/protocol/packet/SettingsCommandPacket';
import type { HandlerServices } from './HandlerContext';
import SettingsCommandHandler from './SettingsCommandHandler';

describe('SettingsCommandHandler', () => {
    it('dispatches the command line with the player as both sender and target', async () => {
        const dispatched: string[] = [];
        const senders: unknown[] = [];
        const session = stub<PlayerSession>({});
        const { context, deferred, settled } = inputContext(session, {
            services: {
                commands: stub<HandlerServices['commands']>({
                    dispatchCommand: async (sender, target, input) => {
                        senders.push(sender, target);
                        dispatched.push(input ?? '');
                        return true;
                    }
                })
            }
        });
        const packet = new SettingsCommandPacket({
            command: '/gamerule showcoordinates true',
            suppressOutput: true
        });

        expect(new SettingsCommandHandler().handle(packet, context)).toBeUndefined();
        // The command runs once the handler has returned, as deferred work.
        expect(dispatched).toEqual([]);
        expect(deferred).toHaveLength(1);
        await settled();

        expect(dispatched).toEqual(['/gamerule showcoordinates true']);
        expect(senders).toEqual([session, session]);
    });
});
