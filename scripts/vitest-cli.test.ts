import { parseCLI } from 'vitest/node';
import { describe, expect, it } from 'vitest';

// `patches/vitest@5.1.2.patch` declares Vitest's boolean flags to its argument parser in kebab case too.
describe('the patched Vitest command line', () => {
    it.each([
        ['--since-last-run', 'sinceLastRun'],
        ['--pass-with-no-tests', 'passWithNoTests'],
        ['--last-failed', 'lastFailed']
    ] as const)('keeps the path after %s as a filter', (flag, option) => {
        const { filter, options } = parseCLI(['vitest', 'run', flag, 'scripts/vitest-cli.test.ts']);

        expect(filter).toEqual(['scripts/vitest-cli.test.ts']);
        expect(options[option]).toBe(true);
    });

    it('still gives a flag that takes a value the argument after it', () => {
        const { filter, options } = parseCLI(['vitest', 'run', '--changed', 'HEAD~1', 'a.test.ts']);

        expect(options.changed).toBe('HEAD~1');
        expect(filter).toEqual(['a.test.ts']);
    });
});
