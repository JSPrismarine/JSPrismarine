import { describe, expect, it } from 'vitest';
import { parseServerArgs, serverCli } from './Cli';

describe('parseServerArgs', () => {
    it('defaults every mode flag off', () => {
        const args = parseServerArgs([]);

        expect(args.port).toBeUndefined();
        expect(args.watch).toBe(false);
        expect(args.noTui).toBe(false);
        expect(args.headless).toBe(false);
        expect(args.role).toBeUndefined();
    });

    it('reads the mode flags and the hidden role', () => {
        const args = parseServerArgs(['--watch', '--no-tui', '--role', 'server', '--port', '19133']);

        expect(args.watch).toBe(true);
        expect(args.noTui).toBe(true);
        expect(args.role).toBe('server');
        expect(args.port).toBe(19133);
        expect(parseServerArgs(['--headless']).headless).toBe(true);
    });

    it('rejects a role it does not know', () => {
        expect(() => parseServerArgs(['--role', 'console'])).toThrow(/role/);
    });

    it('keeps the role out of the help text', async () => {
        const help = await serverCli([]).getHelp();

        expect(help).toContain('--watch');
        expect(help).toContain('--no-tui');
        expect(help).toContain('--headless');
        expect(help).not.toContain('--role');
    });

    it('drops the leading -- that pnpm passes through', () => {
        const args = parseServerArgs(['--', '--port', '19134']);

        expect(args.port).toBe(19134);
    });

    it('refuses --watch together with --headless', () => {
        expect(() => parseServerArgs(['--watch', '--headless'])).toThrow(/--watch.*--headless/);
    });

    it('still refuses a stray positional and a bad port', () => {
        expect(() => parseServerArgs(['start'])).toThrow(/start/);
        expect(() => parseServerArgs(['--port', '70000'])).toThrow(/between 1 and 65535/);
    });
});
