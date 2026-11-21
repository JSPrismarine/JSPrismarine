import { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import type { Intent } from '../../input/Intent';
import { IntentHandlerRegistry } from '../../input/IntentHandlerRegistry';
import { inputContext, sessionContext } from '../../testing/handlerContext.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import { decodedHandler } from './decodedHandler';
import type { PacketDecoder } from './PacketDecoder';

const session = () => stub<PlayerSession>({ runtimeId: 7n, identity: identityNamed('tester'), tracks: () => true });

/** A registry with a recording handler for the kinds a test names, and nothing built in. */
const registryWith = (handled: string[], ...kinds: Array<'openInventory' | 'queryBossBar' | 'openNpc'>) => {
    const registry = new IntentHandlerRegistry(new Logger());
    for (const kind of kinds) {
        if (kind === 'queryBossBar') {
            registry.register(kind, {
                handle: async (intent) => {
                    await Promise.resolve();
                    handled.push(`${intent.kind} ${intent.actor}`);
                }
            });
        } else {
            registry.register(kind, {
                handle: (intent) => {
                    handled.push(intent.kind);
                    return undefined;
                }
            });
        }
    }
    return registry;
};

describe('decodedHandler', () => {
    it('runs in the input lane when any declared intent is an input, and hands intents over in order', () => {
        const handled: string[] = [];
        const decoder: PacketDecoder<string, 'openInventory' | 'queryBossBar'> = {
            phases: ['play'],
            intents: ['queryBossBar', 'openInventory'],
            decode: () => [{ kind: 'openInventory' }, { kind: 'queryBossBar', actor: 42n }]
        };
        const handler = decodedHandler('TestPacket', decoder, registryWith(handled, 'openInventory', 'queryBossBar'));
        expect(handler.lane).toBe('input');
        expect(handler.phases).toEqual(['play']);

        const { context, outputs } = inputContext(session());
        if (handler.lane !== 'input') throw new Error('expected an input-lane handler');
        expect(handler.handle('packet', context)).toBeUndefined();

        // The read-lane handler's promise goes to the step rather than being awaited.
        expect(handled).toEqual(['openInventory']);
        expect(outputs).toHaveLength(1);
    });

    it('runs in the read lane for read-only intents and awaits each handler', async () => {
        const handled: string[] = [];
        const decoder: PacketDecoder<string, 'queryBossBar'> = {
            phases: ['play'],
            intents: ['queryBossBar'],
            decode: () => [{ kind: 'queryBossBar', actor: 1n }]
        };
        const handler = decodedHandler('TestPacket', decoder, registryWith(handled, 'queryBossBar'));
        expect(handler.lane).toBe('read');

        if (handler.lane !== 'read') throw new Error('expected a read-lane handler');
        await handler.handle('packet', sessionContext(session()));
        expect(handled).toEqual(['queryBossBar 1']);
    });

    it('hands the decoder the session view and the log', () => {
        const seen: string[] = [];
        const decoder: PacketDecoder<string, 'openInventory'> = {
            phases: ['play'],
            intents: ['openInventory'],
            decode: (packet, view) => {
                seen.push(`${packet} from ${view.name}#${view.runtimeId}`);
                view.log.debug('looked');
                return [];
            }
        };
        const logged: string[] = [];
        const log = stub<Logger>({ debug: (...message) => void logged.push(String(message[0])) });
        const handler = decodedHandler('TestPacket', decoder, registryWith([], 'openInventory'));
        if (handler.lane !== 'input') throw new Error('expected an input-lane handler');

        handler.handle('ping', inputContext(session(), { log }).context);

        expect(seen).toEqual(['ping from tester#7']);
        expect(logged).toEqual(['looked']);
    });

    it('refuses an intent the decoder did not declare, so no intent runs in too loose a lane', async () => {
        const decoder: PacketDecoder<string, 'queryBossBar'> = {
            phases: ['play'],
            intents: ['queryBossBar'],
            // Declared read-only, returns an input: the cast stands in for a decoder with a bug.
            decode: () => [{ kind: 'openInventory' } as unknown as Intent<'queryBossBar'>]
        };
        const handler = decodedHandler('TestPacket', decoder, registryWith([], 'queryBossBar', 'openInventory'));
        if (handler.lane !== 'read') throw new Error('expected a read-lane handler');

        await expect(handler.handle('packet', sessionContext(session()))).rejects.toThrow(/did not declare/);
    });

    it('refuses a decoder that declares a kind the table does not have', () => {
        const decoder: PacketDecoder<string> = {
            phases: ['play'],
            // A plugin's typo, which the type system cannot see from JavaScript. The cast stands in for it.
            intents: ['teleport' as unknown as 'openInventory'],
            decode: () => []
        };
        expect(() => decodedHandler('TestPacket', decoder, registryWith([]))).toThrow(/not an intent kind/);
    });
});
