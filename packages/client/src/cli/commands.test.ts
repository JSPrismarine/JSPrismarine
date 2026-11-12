import { describe, expect, it } from 'vitest';

import { formatPong } from './commands';

describe('formatPong', () => {
    it('prints the MOTD without the terminal escapes the server put in it', () => {
        // Escape sequences in the MOTD and version fields. None holds a semicolon, which would
        // split the field before it reached the terminal.
        const lines = formatPong('MCPE;\u001B]2owned\u0007Hello\u001B[2J;\u001B[31m1;1.0\r;0;10', 1);

        expect(lines).toEqual(['Hello', '  version   1.0 (protocol 1)', '  players   0/10', '  rtt       1.0 ms']);
    });
});
