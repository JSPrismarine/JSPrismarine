import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The player answered a form.
 *
 * The answer is an input ([ADR 0009](../../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)):
 * it goes to the behavior pack scripts, whose next script flush settles the form's `show()`
 * promise. An answer to a form no script sent is logged at debug level.
 */
export default class AnswerFormHandler implements IntentHandler<'answerForm'> {
    public static readonly Kind = 'answerForm';

    /** Hands the answer to the scripts. */
    public handle(
        { formId, response, cancelReason }: Intent<'answerForm'>,
        { session, log, services }: InputContext
    ): undefined {
        const taken = services.scriptForms.answerForm({
            player: String(session.getRuntimeId()),
            formId,
            response,
            cancelReason
        });
        if (taken) return;

        const outcome =
            response !== null
                ? `submitted ${response}`
                : cancelReason !== null
                  ? `dismissed (reason ${cancelReason})`
                  : 'answered with neither a response nor a reason';
        log.debug(`${session.identity.name} ${outcome} form ${formId}, which no script sent`);
    }
}
