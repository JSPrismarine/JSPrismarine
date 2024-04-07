import { describe, it, expect, vi } from 'vitest';

import { cwd } from './cwd';

import process from 'node:process';
import { resolve } from 'node:path';

describe('urils', () => {
    describe('cwd', () => {
        it('should return the current working directory', () => {
            const result = cwd();
            expect(result).toBe(process.cwd());
        });

        it('should return the current working directory with JSP_DIR', () => {
            vi.stubEnv('JSP_DIR', 'test');
            const result = cwd();
            expect(result).toBe(resolve(process.cwd(), 'test'));
        });
    });
});
