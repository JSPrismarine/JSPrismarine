/**
 * The parts of one input, applied in the order the client gave them when some of them wait.
 *
 * `PlayerAuthInputHandler` applies a movement, actions, an item use and an item stack request
 * from one packet, each through the handler that owns it, and a part may hand work to
 * {@link InputStep.defer}. The input step runs deferred work once the handler returns, so a part
 * applied at once after one that deferred would take effect before it.
 */
import type { InputContext, InputStep } from './HandlerContext';

/**
 * A handler's context with another step in it, for a part. The rest is read through to the
 * handler's context when the part uses it, as the context itself reads the server.
 *
 * @param context - The handler's context.
 * @param step - The step the part runs against.
 */
export const withStep = (context: InputContext, step: InputStep): InputContext => ({
    session: context.session,
    get log() {
        return context.log;
    },
    get config() {
        return context.config;
    },
    services: context.services,
    step
});

/** One part of an input, applied against the step it is handed. */
export type InputPart = (step: InputStep) => undefined;

/**
 * A function that applies each part it is given, in order.
 *
 * Until a part defers work, each part is applied at once, in the handler's unit. From then on,
 * each part is deferred whole, and the work it defers runs inside it, before the next part.
 *
 * @param step - The step of the input the parts belong to.
 */
export const orderedParts = (step: InputStep): ((part: InputPart) => void) => {
    let deferring = false;
    const now: InputStep = {
        tick: step.tick,
        output: (send) => step.output(send),
        defer: (work) => {
            deferring = true;
            step.defer(work);
        }
    };

    return (part) => {
        if (!deferring) {
            part(now);
            return;
        }

        step.defer(async () => {
            const waits: (() => Promise<void>)[] = [];
            part({ tick: step.tick, output: (send) => step.output(send), defer: (work) => void waits.push(work) });
            for (const work of waits) await work();
        });
    };
};
