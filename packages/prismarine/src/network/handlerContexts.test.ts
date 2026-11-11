import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type { Config } from '../config/Config';
import type SessionManager from '../SessionManager';
import { STEVE } from '../testing/sessionIdentity.test.helper';
import { stub } from '../testing/stub.test.helper';
import type { World } from '../world/World';
import type { InputContext, SessionContext } from './handler/HandlerContext';
import type { InputLaneHandler, ReadLaneHandler } from './handler/SessionHandler';
import type { ContextSource } from './handlerContexts';
import { HandlerContexts } from './handlerContexts';
import type PlayerSession from './PlayerSession';

/** A promise the test settles by hand. */
const deferred = () => {
    let resolve: () => void = () => {};
    let reject: (error: unknown) => void = () => {};
    const promise = new Promise<void>((settle, fail) => {
        resolve = settle;
        reject = fail;
    });
    return { promise, resolve, reject };
};

/** A session whose world records when an input's unit opens and closes. */
const sessionInWorld = (order: string[]) => {
    const world = stub<World>({
        runInputNow: (apply) => {
            order.push('unit:open');
            try {
                apply();
            } finally {
                order.push('unit:close');
            }
        }
    });
    return stub<PlayerSession>({ identity: STEVE, getWorld: () => world });
};

const readHandler = (handle: (context: SessionContext) => Promise<void> | void): ReadLaneHandler<string> => ({
    takes: 'context',
    lane: 'read',
    phases: ['play'],
    handle: (_packet, context) => handle(context)
});

const inputHandler = (handle: (context: InputContext) => void): InputLaneHandler<string> => ({
    takes: 'context',
    lane: 'input',
    phases: ['play'],
    handle: (_packet, context) => {
        handle(context);
        return undefined;
    }
});

describe('network/handlerContexts', () => {
    it('hands a read-lane handler the session, the logger and the settings', async () => {
        const logger = stub<Logger>();
        const config = stub<Config>();
        const session = stub<PlayerSession>({ identity: STEVE });
        const contexts = HandlerContexts.of(stub<ContextSource>({ getLogger: () => logger, getConfig: () => config }));
        const seen: SessionContext[] = [];

        await contexts.run(
            readHandler((context) => void seen.push(context)),
            'packet',
            session
        );

        expect(seen).toHaveLength(1);
        expect(seen[0]?.session).toBe(session);
        expect(seen[0]?.log).toBe(logger);
        expect(seen[0]?.config).toBe(config);
    });

    it('reads a part of the server only when a handler uses it', async () => {
        // A server with nothing on it: a handler that reads nothing of it still runs.
        const contexts = HandlerContexts.of(stub<ContextSource>());

        await expect(
            contexts.run(
                readHandler(() => {}),
                'packet',
                stub<PlayerSession>({ identity: STEVE })
            )
        ).resolves.toBeUndefined();
    });

    it('reaches a service through the server it was built from', async () => {
        const sessions = stub<SessionManager>();
        const contexts = HandlerContexts.of(
            stub<ContextSource>({ getTick: () => 0, getSessionManager: () => sessions })
        );
        const seen: unknown[] = [];

        await contexts.run(
            inputHandler(({ services }) => void seen.push(services.sessions)),
            'packet',
            sessionInWorld([])
        );

        expect(seen).toEqual([sessions]);
    });

    it('applies an input as one synchronous unit, and settles once its outputs have', async () => {
        const order: string[] = [];
        const send = deferred();
        const contexts = HandlerContexts.of(stub<ContextSource>({ getTick: () => 12 }));

        const running = contexts
            .run(
                inputHandler(({ step }) => {
                    order.push(`handle at ${step.tick}`);
                    step.output(send.promise.then(() => void order.push('sent')));
                }),
                'packet',
                sessionInWorld(order)
            )
            .then(() => void order.push('settled'));

        // The handler ran inside its unit before `run` returned, and nothing waits on the send yet.
        expect(order).toEqual(['unit:open', 'handle at 12', 'unit:close']);
        send.resolve();
        await running;

        expect(order).toEqual(['unit:open', 'handle at 12', 'unit:close', 'sent', 'settled']);
    });

    it('reports a failed output as the input failing', async () => {
        const contexts = HandlerContexts.of(stub<ContextSource>({ getTick: () => 0 }));

        await expect(
            contexts.run(
                inputHandler(({ step }) => step.output(Promise.reject(new Error('the send failed')))),
                'packet',
                sessionInWorld([])
            )
        ).rejects.toThrow('the send failed');
    });

    it('waits for the outputs of an input that throws before it passes the error on', async () => {
        const order: string[] = [];
        const send = deferred();
        const contexts = HandlerContexts.of(stub<ContextSource>({ getTick: () => 0 }));

        const running = contexts
            .run(
                inputHandler(({ step }) => {
                    step.output(send.promise.then(() => void order.push('sent')));
                    throw new Error('the handler failed');
                }),
                'packet',
                sessionInWorld(order)
            )
            .catch((error: unknown) => void order.push(error instanceof Error ? error.message : String(error)));

        await Promise.resolve();
        expect(order).toEqual(['unit:open', 'unit:close']);
        send.resolve();
        await running;

        expect(order).toEqual(['unit:open', 'unit:close', 'sent', 'the handler failed']);
    });
});
