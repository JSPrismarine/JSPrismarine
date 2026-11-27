/**
 * Reads the message a `git commit` shell command passes, so the agent commit
 * gate can run commitlint on it before the slower lint, and before Git's own
 * `commit-msg` hook would reject it.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

/** `"$(cat <<'EOF'` … `EOF` … `)"`, the heredoc form agents write multi-line messages in. */
const HEREDOC_VALUE = /^"\$\(cat\s+<<-?\s*(['"]?)(\w+)\1[ \t]*\n([\s\S]*?)\n[ \t]*\2[ \t]*\n\s*\)"/;

/** Where one shell command ends and the next begins. */
const SEPARATOR = /^(?:&&|\|\||[;|&\n])/;

interface Word {
    text: string;
    /** The shell would expand part of it, so `text` is not what Git receives. */
    dynamic: boolean;
}

/** Reads one shell word at `start`; `undefined` at a separator or the end of the command. */
const readWord = (command: string, start: number): { word: Word; end: number } | undefined => {
    let index = start;
    let text = '';
    let dynamic = false;
    while (index < command.length) {
        const rest = command.slice(index);
        const char = command[index];
        if (/^\s/.test(rest) || SEPARATOR.test(rest)) break;
        const heredoc = HEREDOC_VALUE.exec(rest);
        if (heredoc) {
            text += heredoc[3];
            index += heredoc[0].length;
        } else if (char === "'") {
            const close = command.indexOf("'", index + 1);
            if (close === -1) return undefined;
            text += command.slice(index + 1, close);
            index = close + 1;
        } else if (char === '"') {
            index++;
            while (index < command.length && command[index] !== '"') {
                const inner = command[index];
                if (inner === '\\' && /["\\$`\n]/.test(command[index + 1] ?? '')) {
                    if (command[index + 1] !== '\n') text += command[index + 1];
                    index += 2;
                    continue;
                }
                if (inner === '$' || inner === '`') dynamic = true;
                text += inner;
                index++;
            }
            if (index >= command.length) return undefined;
            index++;
        } else if (char === '\\') {
            text += command[index + 1] ?? '';
            index += 2;
        } else {
            if (char === '$' || char === '`') dynamic = true;
            text += char;
            index++;
        }
    }
    return index === start ? undefined : { word: { text, dynamic }, end: index };
};

/** The words of the command that starts at `start`, up to the first separator. */
const readWords = (command: string, start: number): Word[] => {
    const words: Word[] = [];
    let index = start;
    while (index < command.length) {
        while (/[ \t]/.test(command[index] ?? '') || (command[index] === '\\' && command[index + 1] === '\n')) {
            index += command[index] === '\\' ? 2 : 1;
        }
        const read = readWord(command, index);
        if (!read) break;
        words.push(read.word);
        index = read.end;
    }
    return words;
};

/**
 * The commit message `command` gives Git, from its `-m`, `--message`, `-F` and
 * `--file` options, with `-m` paragraphs joined as Git joins them. `commitStart`
 * is the index just past the `commit` word.
 *
 * `undefined` when the command gives no message, or gives one the shell would
 * build at run time, such as `-m "$title"`: Git's `commit-msg` hook still
 * checks those.
 */
export const commitMessage = (command: string, commitStart: number, cwd: string): string | undefined => {
    const words = readWords(command, commitStart);
    const paragraphs: string[] = [];
    for (let index = 0; index < words.length; index++) {
        const word = words[index];
        if (word === undefined || word.text === '--') break;
        const { text } = word;
        let value: Word | undefined;
        let fromFile = false;
        const long = /^--(message|file)(?:=([\s\S]*))?$/.exec(text);
        const short = /^-[a-zA-Z]*?([mF])([\s\S]*)$/.exec(text);
        if (long) {
            fromFile = long[1] === 'file';
            value = long[2] === undefined ? words[++index] : { ...word, text: long[2] };
        } else if (short && !text.startsWith('--')) {
            fromFile = short[1] === 'F';
            value = short[2] === '' ? words[++index] : { ...word, text: short[2] ?? '' };
        } else {
            continue;
        }
        if (value === undefined || value.dynamic) return undefined;
        if (!fromFile) {
            paragraphs.push(value.text);
            continue;
        }
        if (value.text === '-') return undefined;
        try {
            paragraphs.push(readFileSync(path.resolve(cwd, value.text), 'utf8'));
        } catch {
            return undefined;
        }
    }
    return paragraphs.length === 0 ? undefined : paragraphs.join('\n\n');
};
