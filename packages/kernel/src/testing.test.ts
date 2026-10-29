import { describe, expect, it } from 'vitest';

import type { Module } from './module';
import { startTestModule, stubService } from './testing';
import { createToken } from './token';

interface Clock {
    now(): number;
}

interface Chat {
    broadcast(message: string): void;
}

const clockToken = createToken<Clock>('test:clock');
const chatToken = createToken<Chat>('test:chat');

/** A module that reads the clock and provides a chat service. */
const chatModule = (sent: string[]) =>
    ({
        id: 'chat',
        dependencies: [clockToken],
        register(ctx) {
            ctx.provide(chatToken, {
                broadcast: (message) => sent.push(`${ctx.use(clockToken).now()} ${message}`)
            });
        }
    }) satisfies Module;

describe('startTestModule', () => {
    it('starts the module against stubbed dependencies', async () => {
        const sent: string[] = [];
        const handle = await startTestModule(chatModule(sent), {
            stubs: [stubService(clockToken, { now: () => 42 })]
        });
        handle.get(chatToken).broadcast('hello');
        await handle.stop();

        expect(sent).toStrictEqual(['42 hello']);
    });

    it('restarts the module kernel after stop without re-registering', async () => {
        const starts: string[] = [];
        const restartable: Module = {
            id: 'restartable',
            register() {},
            start() {
                starts.push('start');
            },
            stop() {
                starts.push('stop');
            }
        };
        const handle = await startTestModule(restartable);
        await handle.stop();
        await handle.start();
        await handle.stop();

        expect(starts).toStrictEqual(['start', 'stop', 'start', 'stop']);
    });

    it('fails when a declared dependency has no stub', async () => {
        await expect(startTestModule(chatModule([]))).rejects.toThrow(
            'Module "chat" depends on service "test:clock" but no registered module provides it'
        );
    });

    it('rejects a stub whose token the module no longer declares', async () => {
        const undeclared = createToken<Clock>('test:stale');

        await expect(
            startTestModule(chatModule([]), {
                stubs: [stubService(clockToken, { now: () => 0 }), stubService(undeclared, { now: () => 0 })]
            })
        ).rejects.toThrow('Stub for "test:stale" is not in module "chat"\'s declared dependencies');
    });

    it('surfaces undeclared use() so dependency lists cannot drift silently', async () => {
        const drifted: Module = {
            id: 'drifted',
            dependencies: [],
            register() {},
            start(ctx) {
                ctx.use(clockToken);
            }
        };

        await expect(startTestModule(drifted)).rejects.toThrow(
            'Module "drifted" used service "test:clock" without declaring it as a dependency'
        );
    });

    it('passes the config slice through to the module', async () => {
        const seen: number[] = [];
        const configured: Module<{ limit: number }> = {
            id: 'configured',
            register(ctx) {
                seen.push(ctx.config.limit);
            }
        };
        await startTestModule(configured, { config: { limit: 3 } });

        expect(seen).toStrictEqual([3]);
    });
});
