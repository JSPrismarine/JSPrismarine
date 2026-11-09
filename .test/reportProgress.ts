import { expect } from 'vitest';

import { annotation } from './workflowCommands';

/** The test file that is running, for the annotation to point at, or undefined outside a test. */
const runningTestFile = (): string | undefined => {
    try {
        return expect.getState().testPath;
    } catch {
        return undefined;
    }
};

/**
 * Reports non-gating progress: a CI notice on the test file that reported it, or a local
 * console warning.
 */
export const reportProgress = (message: string, title = 'Implementation progress'): void => {
    if (process.env.GITHUB_ACTIONS === 'true') {
        process.stdout.write(`${annotation('notice', message, { title, file: runningTestFile() })}\n`);
        return;
    }

    console.warn(`[${title.toLowerCase()}] ${message}`);
};
