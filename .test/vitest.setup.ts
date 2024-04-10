import { vi, beforeEach } from 'vitest';

beforeEach(() => {
    vi.stubEnv('JSP_DIR', 'jsp');
});
