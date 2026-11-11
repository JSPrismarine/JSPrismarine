import { describe, expect, expectTypeOf, it } from 'vitest';

import type { InputHandler, LaneHandler, PacketHandler, ServerboundHandler } from './PacketHandler';

interface Ping {
    readonly time: number;
}

/** Two sides' contexts, as the server and the client would supply them. */
interface ServerContexts {
    readonly connection: { readonly reply: (time: number) => Promise<void> };
    readonly read: { readonly reply: (time: number) => Promise<void> };
    readonly input: { readonly output: (send: Promise<void>) => void };
}
interface ClientContext {
    readonly answer: (time: number) => Promise<void>;
}

describe('handler/PacketHandler', () => {
    it('serves a client handler with no lane', async () => {
        const answered: number[] = [];
        const handler: PacketHandler<Ping, ClientContext, 'play'> = {
            phases: ['play'],
            handle: async (packet, context) => context.answer(packet.time)
        };

        await handler.handle({ time: 3 }, { answer: async (time) => void answered.push(time) });

        expect(answered).toEqual([3]);
    });

    it('chooses the context of a serverbound handler by its lane', () => {
        const relay: ServerboundHandler<Ping, ServerContexts> = {
            lane: 'input',
            phases: ['play'],
            handle: (_packet, context) => {
                context.output(Promise.resolve());
                return undefined;
            }
        };

        if (relay.lane === 'input') expectTypeOf(relay).toEqualTypeOf<InputHandler<Ping, ServerContexts['input']>>();
        expectTypeOf<LaneHandler<Ping, ServerContexts['read'], 'read'>>().toExtend<
            ServerboundHandler<Ping, ServerContexts>
        >();
    });

    it('refuses an input-lane handler that returns a promise', () => {
        const handler: InputHandler<Ping, ServerContexts['input']> = {
            lane: 'input',
            phases: ['play'],
            // @ts-expect-error the input step applies an input synchronously
            handle: async () => {}
        };
        void handler;
    });
});
