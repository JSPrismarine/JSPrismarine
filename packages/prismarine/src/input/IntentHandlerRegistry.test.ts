import { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import { inputContext, sessionContext } from '../testing/handlerContext.test.helper';
import { identityNamed } from '../testing/sessionIdentity.test.helper';
import { stub } from '../testing/stub.test.helper';
import type PlayerSession from '../network/PlayerSession';
import { INTENT_KINDS } from './Intent';
import { IntentHandlerRegistry } from './IntentHandlerRegistry';

const session = () => stub<PlayerSession>({ identity: identityNamed('tester') });

describe('IntentHandlerRegistry', () => {
    it('registers a built-in handler for every kind in the table when enabled', () => {
        const registry = new IntentHandlerRegistry(new Logger());

        registry.enable();
        for (const kind of INTENT_KINDS) expect(registry.has(kind), kind).toBe(true);

        registry.disable();
        for (const kind of INTENT_KINDS) expect(registry.has(kind), kind).toBe(false);
    });

    it('refuses a second handler for a kind', () => {
        const registry = new IntentHandlerRegistry(new Logger());
        registry.register('openInventory', { handle: () => undefined });

        expect(() => registry.register('openInventory', { handle: () => undefined })).toThrow(/already exists/);
    });

    it('refuses a kind the table does not have', () => {
        const registry = new IntentHandlerRegistry(new Logger());

        // A plugin's typo, which the type system cannot see from JavaScript. The cast stands in for it.
        expect(() => registry.register('teleport' as unknown as 'openInventory', { handle: () => undefined })).toThrow(
            /not an intent kind/
        );
    });

    it('throws for an intent with no handler', () => {
        const registry = new IntentHandlerRegistry(new Logger());

        expect(() => registry.handle({ kind: 'openInventory' }, sessionContext(session()))).toThrow(/No handler/);
    });

    it('appends an input-lane handler after the current one, and hands a stray promise to the step', () => {
        const registry = new IntentHandlerRegistry(new Logger());
        const order: string[] = [];
        registry.register('openInventory', {
            handle: () => {
                order.push('first');
                return undefined;
            }
        });
        registry.append('openInventory', {
            // A part written as asynchronous: allowed, but its promise must not be lost.
            handle: () => {
                order.push('second');
                return Promise.resolve() as unknown as undefined;
            }
        });

        const { context, outputs } = inputContext(session());
        expect(registry.handle({ kind: 'openInventory' }, context)).toBeUndefined();

        expect(order).toEqual(['first', 'second']);
        expect(outputs).toHaveLength(1);
    });

    it('appends a read-lane handler and awaits both in order', async () => {
        const registry = new IntentHandlerRegistry(new Logger());
        const order: string[] = [];
        const part = (name: string) => ({
            handle: async (intent: { readonly actor: bigint }) => {
                await Promise.resolve();
                order.push(`${name} ${intent.actor}`);
            }
        });
        registry.register('queryBossBar', part('first'));
        registry.append('queryBossBar', part('second'));

        await registry.handle({ kind: 'queryBossBar', actor: 3n }, sessionContext(session()));

        expect(order).toEqual(['first 3', 'second 3']);
    });

    it('runs a handler appended before the server started after the built-in one', () => {
        const registry = new IntentHandlerRegistry(new Logger());
        const order: string[] = [];
        registry.append('openInventory', {
            handle: () => {
                order.push('plugin');
                return undefined;
            }
        });

        registry.enable();
        const { context } = inputContext(
            stub<PlayerSession>({
                identity: identityNamed('tester'),
                openMainInventory: async () => void order.push('built-in')
            })
        );
        registry.handle({ kind: 'openInventory' }, context);

        expect(order).toEqual(['built-in', 'plugin']);
    });

    it('registers an appended handler outright when the kind has none yet', () => {
        const registry = new IntentHandlerRegistry(new Logger());
        registry.append('openInventory', { handle: () => undefined });

        expect(registry.has('openInventory')).toBe(true);
    });
});
