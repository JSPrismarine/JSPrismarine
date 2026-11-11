import { describe, expect, it } from 'vitest';

import { strictestLane } from './Lane';

describe('handler/Lane', () => {
    it('merges two handlers into the stricter lane', () => {
        expect(strictestLane('connection', 'read')).toBe('read');
        expect(strictestLane('input', 'read')).toBe('input');
        expect(strictestLane('connection', 'connection')).toBe('connection');
    });
});
