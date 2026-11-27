import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { commitMessage } from './commit-message.mts';

/** The message of `command`, read from just past its `commit` word as the gate does. */
const messageOf = (command: string, cwd = process.cwd()) => {
    const match = /\bcommit\b/.exec(command);
    return match ? commitMessage(command, match.index + match[0].length, cwd) : undefined;
};

describe('commitMessage', () => {
    it('reads single- and double-quoted -m values', () => {
        expect(messageOf("git commit -m 'fix(server): stop'")).toBe('fix(server): stop');
        expect(messageOf('git commit -m "fix(server): read \\"x\\""')).toBe('fix(server): read "x"');
    });

    it('joins repeated -m values into paragraphs', () => {
        expect(messageOf('git commit -m "feat: a" -m "Body."')).toBe('feat: a\n\nBody.');
    });

    it('reads attached and long forms', () => {
        expect(messageOf('git commit -am"feat: a"')).toBe('feat: a');
        expect(messageOf('git commit --message="feat: a"')).toBe('feat: a');
        expect(messageOf('git commit --message "feat: a"')).toBe('feat: a');
    });

    it('reads the heredoc form', () => {
        const command = `git commit -m "$(cat <<'EOF'\nfeat(x): add y\n\nBody line.\nEOF\n)"`;
        expect(messageOf(command)).toBe('feat(x): add y\n\nBody line.');
    });

    it('reads backticks inside single quotes as text', () => {
        expect(messageOf("git commit -m 'fix: read `.env`'")).toBe('fix: read `.env`');
    });

    it('reads a message file relative to the working directory', () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'commit-message-'));
        writeFileSync(path.join(dir, 'msg.txt'), 'docs: fix typo\n');
        expect(messageOf('git commit -F msg.txt', dir)).toBe('docs: fix typo\n');
        expect(messageOf('git commit --file=msg.txt', dir)).toBe('docs: fix typo\n');
    });

    it('stops at the end of the git command', () => {
        expect(messageOf('git add a && git commit -m "feat: a" && echo -m "nope"')).toBe('feat: a');
    });

    it('gives up on messages the shell builds at run time', () => {
        expect(messageOf('git commit -m "$title"')).toBeUndefined();
        expect(messageOf('git commit -m "feat: `date`"')).toBeUndefined();
        expect(messageOf('git commit -F -')).toBeUndefined();
    });

    it('finds no message when the command passes none', () => {
        expect(messageOf('git commit --fixup=abc123')).toBeUndefined();
        expect(messageOf('git commit --amend --no-edit')).toBeUndefined();
    });
});
