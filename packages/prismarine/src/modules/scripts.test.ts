import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { scriptConfigDirectory } from './scripts';

describe('modules/scripts', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('reads the script config folder from the server directory JSP_DIR names, beside config.json', () => {
        const server = path.resolve('/srv/world-a');
        vi.stubEnv('JSP_DIR', server);

        expect(scriptConfigDirectory()).toBe(path.join(server, 'config'));
    });
});
