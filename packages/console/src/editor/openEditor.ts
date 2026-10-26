import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SourceLocation } from '../log/sourceLocation';

/** Splits an editor command into arguments without passing it through a shell. */
function parseCommand(value: string): string[] {
    const words: string[] = [];
    let word = '';
    let quote: 'single' | 'double' | undefined;

    for (let index = 0; index < value.length; index += 1) {
        const character = value[index]!;
        if (character === '\\' && quote !== 'single') {
            const next = value[index + 1];
            if (next === undefined) {
                word += character;
            } else if (/\s|["'\\]/.test(next)) {
                word += next;
                index += 1;
            } else {
                word += character;
            }
            continue;
        }
        if (quote === 'single') {
            if (character === "'") quote = undefined;
            else word += character;
            continue;
        }
        if (quote === 'double') {
            if (character === '"') quote = undefined;
            else word += character;
            continue;
        }
        if (character === "'") quote = 'single';
        else if (character === '"') quote = 'double';
        else if (/\s/.test(character)) {
            if (word !== '') words.push(word);
            word = '';
        } else word += character;
    }

    if (quote !== undefined) throw new Error('EDITOR contains an unmatched quote');
    if (word !== '') words.push(word);
    if (words.length === 0) throw new Error('EDITOR is empty');
    return words;
}

function findRepositoryRoot(cwd: string): string | undefined {
    let current = resolve(cwd);
    while (true) {
        if (existsSync(join(current, 'packages'))) return current;
        const parent = dirname(current);
        if (parent === current) return undefined;
        current = parent;
    }
}

function sourcePathOf(location: SourceLocation, cwd: string): string {
    let source = location.path;
    if (source.startsWith('file://')) source = fileURLToPath(source);
    if (isAbsolute(source) && existsSync(source)) return source;

    const repositoryRoot = findRepositoryRoot(cwd);
    if (repositoryRoot === undefined) {
        const localPath = resolve(cwd, source);
        if (existsSync(localPath)) return localPath;
        throw new Error(`source file not found: ${source}`);
    }

    const packagePath = /(?:^|[/\\])packages[/\\]([^/\\]+)[/\\]src[/\\](.+)$/.exec(source);
    if (packagePath?.[1] && packagePath[2]) {
        const candidate = resolve(repositoryRoot, 'packages', packagePath[1], 'src', packagePath[2]);
        if (existsSync(candidate)) return candidate;
    }

    const sourceRelative = /(?:^|[/\\])src[/\\](.+)$/.exec(source)?.[1] ?? source;
    const packages = join(repositoryRoot, 'packages');
    for (const entry of readdirSync(packages, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const candidate = resolve(packages, entry.name, 'src', sourceRelative);
        if (existsSync(candidate)) return candidate;
    }

    const repositoryPath = resolve(repositoryRoot, source);
    if (existsSync(repositoryPath)) return repositoryPath;
    throw new Error(`source file not found in workspace: ${source}`);
}

function editorArguments(command: string, base: readonly string[], location: SourceLocation, path: string): string[] {
    const executable = basename(command)
        .toLowerCase()
        .replace(/\.exe$/, '');
    const lineColumn = `${location.line}:${location.column}`;
    if (['code', 'code-insiders', 'codium', 'cursor'].includes(executable)) {
        return [...base, '--goto', `${path}:${lineColumn}`];
    }
    if (['vim', 'nvim', 'vi'].includes(executable)) {
        return [...base, `+call cursor(${location.line},${location.column})`, path];
    }
    if (executable === 'nano') return [...base, `+${location.line},${location.column}`, path];
    if (executable === 'emacs') return [...base, `+${lineColumn}`, path];
    if (executable === 'zed') return [...base, `${path}:${lineColumn}`];
    return [...base, path];
}

/** Opens a recorded source location in the user's configured `VISUAL` or `EDITOR`. */
export async function openSourceInEditor(
    editorValue: string | undefined,
    location: SourceLocation,
    cwd: string,
    env: NodeJS.ProcessEnv
): Promise<void> {
    if (editorValue === undefined || editorValue.trim() === '') {
        throw new Error('set VISUAL or EDITOR to open source locations');
    }

    const [command, ...baseArguments] = parseCommand(editorValue);
    if (command === undefined) throw new Error('EDITOR is empty');
    const path = sourcePathOf(location, cwd);
    const childArguments = editorArguments(command, baseArguments, location, path);

    await new Promise<void>((resolveProcess, rejectProcess) => {
        const child = spawn(command, childArguments, { cwd, env, stdio: 'inherit' });
        child.once('error', rejectProcess);
        child.once('exit', (code, signal) => {
            if (code === 0) resolveProcess();
            else rejectProcess(new Error(signal ? `EDITOR exited from ${signal}` : `EDITOR exited with code ${code}`));
        });
    });
}
