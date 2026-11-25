/**
 * The handlers of each intent kind, which decoders of every edition dispatch through
 * ([ADR 0027](../../../../docs/adr/0027-player-inputs-are-decoded-into-intents.md)).
 *
 * One handler per kind, with the merge rule the packet handler registry has: a plugin that wants
 * to add behavior to an intent appends a handler, and the merged handler runs both in order in
 * the kind's lane.
 */
import type { Logger } from '@jsprismarine/logger';
import { PrismarineInputErrors } from '@jsprismarine/errors/prismarine/input';
import type { InputContext, SessionContext } from '../player/context/HandlerContext';
import * as IntentHandlers from './IntentHandlers';
import type { Intent, IntentKind } from './Intent';
import { Intents, isIntentKind } from './Intent';
import type { IntentHandler } from './IntentHandler';

/**
 * A registered handler, with the kind's lane erased: the registry checks a kind's lane once when
 * it dispatches, and the handler takes the context that lane gives and returns what that lane
 * allows.
 */
interface AnyHandler {
    handle(intent: Intent, context: SessionContext | InputContext): undefined | void | Promise<void>;
}

/** A built-in handler class, as the table of them is read. */
interface BuiltInHandlerClass {
    readonly Kind: IntentKind;
    new (): AnyHandler;
}

/** The built-in and plugin handlers of every intent kind. */
export class IntentHandlerRegistry {
    private readonly handlers = new Map<IntentKind, AnyHandler>();
    private readonly logger: Pick<Logger, 'debug' | 'verbose'>;

    public constructor(logger: Pick<Logger, 'debug' | 'verbose'>) {
        this.logger = logger;
    }

    /**
     * Installs the built-in handler of every kind in the table. A handler a plugin appended before
     * the server started runs after the built-in one, as one appended later does.
     */
    public enable(): void {
        const classes: readonly BuiltInHandlerClass[] = Object.values(IntentHandlers);
        for (const Handler of classes) {
            const kind = Handler.Kind;
            const builtIn = new Handler();
            const appended = this.handlers.get(kind);
            this.handlers.set(kind, appended === undefined ? builtIn : this.merge(kind, builtIn, appended));
            this.logger.debug(`Intent handler §b${Handler.name}§r registered for ${kind}`);
        }
        this.logger.verbose(`Registered §b${this.handlers.size}§r intent handler(s)`);
    }

    /** Forgets every handler, built-in and plugin. */
    public disable(): void {
        this.handlers.clear();
    }

    /**
     * Registers the one handler of a kind.
     *
     * @throws When the kind already has a handler; append to it instead.
     */
    public register<K extends IntentKind>(kind: K, handler: IntentHandler<K>): void {
        if (!isIntentKind(kind)) throw new PrismarineInputErrors.UnknownIntentKind({ kind });
        if (this.handlers.has(kind)) throw new PrismarineInputErrors.DuplicateIntentHandler({ kind });
        this.handlers.set(kind, widen(handler));
        this.logger.debug(`Intent handler §b${handler.constructor.name}§r registered for ${kind}`);
    }

    /**
     * Runs `handler` after the kind's current handler, or registers it when the kind has none.
     *
     * The merged handler runs in the kind's lane. In the input lane each part returns nothing to
     * wait for; a part that returns a promise anyway has it handed to the step's outputs.
     */
    public append<K extends IntentKind>(kind: K, handler: IntentHandler<K>): void {
        const current = this.handlers.get(kind);
        if (current === undefined) {
            this.register(kind, handler);
            return;
        }
        this.handlers.set(kind, this.merge(kind, current, widen(handler)));
    }

    /** Whether any handler is registered for `kind`. */
    public has(kind: IntentKind): boolean {
        return this.handlers.has(kind);
    }

    /**
     * Runs the handler of an intent in the context its lane gets.
     *
     * The caller runs in a lane at least as strict as the intent's, so the context it holds is
     * one the handler can take: an input context serves a read-lane handler, which reads the
     * session and the log from it.
     *
     * @returns What the handler returned: nothing for an input-lane intent, possibly a promise
     *   for a read-lane one.
     * @throws When the kind has no handler.
     */
    public handle(intent: Intent, context: SessionContext | InputContext): undefined | void | Promise<void> {
        const handler = this.handlers.get(intent.kind);
        if (handler === undefined) throw new PrismarineInputErrors.NoIntentHandler({ kind: intent.kind });
        return handler.handle(intent, context);
    }

    /** One handler that runs `first` and then `second`, in the kind's lane. */
    private merge(kind: IntentKind, first: AnyHandler, second: AnyHandler): AnyHandler {
        const parts = [first, second];
        if (Intents[kind].lane === 'input') {
            return {
                handle: (intent, context) => {
                    for (const part of parts) {
                        const result = part.handle(intent, context);
                        if (result instanceof Promise) inputStepOf(context).step.output(result);
                    }
                    return undefined;
                }
            };
        }
        return {
            handle: async (intent, context) => {
                for (const part of parts) await part.handle(intent, context);
            }
        };
    }
}

/**
 * Erases a handler's kind. The registry keys handlers by kind and dispatches an intent of that
 * kind only, so the narrowing the type parameter gave is kept by the map and not by the value;
 * the compiler cannot see that from the map's type, hence the cast.
 */
const widen = <K extends IntentKind>(handler: IntentHandler<K>): AnyHandler => handler as unknown as AnyHandler;

/**
 * The input context a merged input-lane handler was given. The dispatcher hands an input-lane
 * handler an input context, so a context without a step here is a caller's bug.
 */
const inputStepOf = (context: SessionContext | InputContext): InputContext => {
    if (!isInputContext(context)) throw new PrismarineInputErrors.InputContextWithoutStep();
    return context;
};

const isInputContext = (context: SessionContext): context is InputContext => 'step' in context;
