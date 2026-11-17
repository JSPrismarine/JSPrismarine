import { describe, expect, it } from 'vitest';

import { readCommandAnswer } from './commands.ts';

describe('readCommandAnswer', () => {
    it('reads a refusal and an accepted command from their log lines', () => {
        expect(
            readCommandAnswer(
                'time set nonsense',
                '[2026-11-17 14:20:41:811 ERROR] Syntax error: Unexpected "nonsense": at "/time set >>nonsense<<"'
            )
        ).toEqual({
            command: 'time set nonsense',
            level: 'ERROR',
            message: 'Syntax error: Unexpected "nonsense": at "/time set >>nonsense<<"'
        });
        expect(readCommandAnswer('time set day', '[2026-11-17 14:20:49:284 INFO] Set the time to 1000')).toEqual({
            command: 'time set day',
            level: 'INFO',
            message: 'Set the time to 1000'
        });
    });

    it('skips a line that is not an INFO or ERROR log line', () => {
        expect(readCommandAnswer('say hi', '[2026-11-17 14:20:40:331 WARN] Allow list is enabled')).toBeUndefined();
        expect(readCommandAnswer('say hi', 'Quit correctly')).toBeUndefined();
    });
});
