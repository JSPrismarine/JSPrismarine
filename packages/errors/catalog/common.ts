import { defineErrors } from './defineErrors';

/** Errors any package may raise, not tied to one domain. */
export const CommonErrors = defineErrors('common', {
    /**
     * Something threw or rejected with a value that is not an `Error`, such as a string, and the
     * code that caught it needed an `Error`. The message is the value as text.
     */
    ThrownValue: '{value}'
});

/**
 * A thrown value as an `Error`: itself when it is one, otherwise wrapped so its text survives into
 * a log or a rejection that expects an `Error`.
 */
export const asError = (value: unknown): Error =>
    value instanceof Error ? value : new CommonErrors.ThrownValue({ value });
