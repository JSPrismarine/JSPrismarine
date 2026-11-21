import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { CommandContext } from './command';
import { runCommand, USAGE } from './command';
import { copyHello, temporaryDirectory } from './fixture.test-utils';

/** A context that records what the command writes. */
const recording = (env: Record<string, string> = {}) => {
    const output = { stdout: '', stderr: '' };
    const context: CommandContext = {
        env,
        stdout: (text) => {
            output.stdout += text;
        },
        stderr: (text) => {
            output.stderr += text;
        }
    };
    return { context, output };
};

describe('jsp-addon', () => {
    it('builds the addons and writes the release tag, new packs and listing files as step outputs', async () => {
        const { addons } = await copyHello();
        const out = await temporaryDirectory();
        const outputs = path.join(await temporaryDirectory(), 'github-output');
        const { context, output } = recording({ GITHUB_REPOSITORY: 'owner/repo' });

        const code = await runCommand(
            ['build', '--addons', addons, '--out', out, '--offline', '--github-output', outputs],
            context
        );

        expect(code).toBe(0);
        expect(output.stdout).toContain('hello 1.2.3: new');
        expect(await readFile(outputs, 'utf8')).toBe('tag=addons\nadded=hello-1.2.3.mcpack\nlisting=hello-1.2.3.md\n');
        expect(await readFile(path.join(out, 'index.json'), 'utf8')).toContain(
            'https://github.com/owner/repo/releases/download/addons/hello-1.2.3.mcpack'
        );
    });

    it('prints the usage with --help', async () => {
        const { context, output } = recording();

        expect(await runCommand(['--help'], context)).toBe(0);
        expect(output.stdout).toBe(USAGE);
    });

    it('exits with 2 without a repository or base URL', async () => {
        const { context, output } = recording();

        expect(await runCommand(['build', '--offline'], context)).toBe(2);
        expect(output.stderr).toContain('pass --repository or --base-url');
    });

    it('exits with 2 for an unknown command or option', async () => {
        const { context, output } = recording();

        expect(await runCommand(['publish'], context)).toBe(2);
        expect(await runCommand(['build', '--zip'], context)).toBe(2);
        expect(output.stderr).toContain('unknown command publish');
        expect(output.stderr).toContain('--zip');
    });

    it('exits with 1 and the error code for an invalid addon', async () => {
        const { addons, addon } = await copyHello();
        await rm(path.join(addon, 'README.md'));
        const { context, output } = recording();

        const code = await runCommand(
            [
                'build',
                '--addons',
                addons,
                '--out',
                await temporaryDirectory(),
                '--base-url',
                'https://example.com',
                '--offline'
            ],
            context
        );

        expect(code).toBe(1);
        expect(output.stderr).toContain('addon hello has no README.md');
        expect(output.stderr).toContain('ADDON_TOOLS_MISSING_ADDON_FILE');
    });
});
