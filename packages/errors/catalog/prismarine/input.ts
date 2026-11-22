import { defineErrors } from '../defineErrors';

/** The errors the intent dispatch of `@jsprismarine/prismarine` throws. */
export const PrismarineInputErrors = defineErrors('prismarine/input', {
    /**
     * Two handlers were registered for the same intent kind. A plugin that wants to add behavior
     * to an intent appends its handler instead of registering a second one.
     */
    DuplicateIntentHandler: 'An intent handler for {kind} already exists',
    /**
     * A decoder produced an intent whose kind has no handler. Every kind in the intent table has a
     * built-in handler, so this is a bug in the server; report it with the stack trace.
     */
    NoIntentHandler: 'No handler is registered for the {kind} intent',
    /**
     * A decoder declared it may produce an intent kind the intent table does not have. This is a
     * bug in the server or a plugin; the decoder's `intents` list names the kinds it returns.
     */
    UnknownIntentKind: '{kind} is not an intent kind',
    /**
     * A decoder returned an intent of a kind it did not declare, so the dispatcher may have run
     * it in a lane too loose for that kind. This is a bug in the decoder; its `intents` list has
     * to name every kind it returns.
     */
    UndeclaredIntent: 'The {packetName} decoder returned a {kind} intent it did not declare',
    /**
     * An input-lane intent handler was run with a context that has no input step, so it had
     * nowhere to hand a send. This is a bug in the server; report it with the stack trace.
     */
    InputContextWithoutStep: 'An input-lane intent handler was run outside an input step'
});
