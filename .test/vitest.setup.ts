import { vi, beforeEach } from 'vitest';

// Default the server's state root to the gitignored `jsp/` so a test that writes one leaves it
// out of the tree. Only when nothing has chosen a root already: this runs after a suite's
// `beforeAll`, so setting it unconditionally used to overwrite the temp directory a suite had
// just stubbed, and every such suite opened `jsp/worlds/<name>/db` instead. LevelDB takes a
// directory lock, so under a parallel run they refused each other.
beforeEach(() => {
    if (process.env.JSP_DIR === undefined) vi.stubEnv('JSP_DIR', 'jsp');
});
