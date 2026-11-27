import { collectAsyncCommands } from '../command/deferred';

/**
 * Calls a command host verb as a dispatch does, and waits for the work it parks.
 *
 * A verb outside a dispatch refuses to run, since nothing would await its work. This opens the
 * collection a dispatch opens and awaits what the verb parked, so a failure in that work fails
 * the test that called it.
 *
 * @param verb - The call to the verb.
 * @returns What the verb answered, once its work has settled.
 */
export const inDispatch = async <T>(verb: () => T): Promise<T> => {
    // `collectAsyncCommands` runs the verb before it returns, or throws what the verb threw.
    let answer!: T;
    await Promise.all(
        collectAsyncCommands(() => {
            answer = verb();
        })
    );
    return answer;
};
