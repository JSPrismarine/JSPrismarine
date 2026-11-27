import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

type Workflow = {
    jobs: { 'aot-release': { steps: { run?: string; name: string }[] } };
};

const GITHUB_EVENT_NAME = '${{ github.event_name }}';

const publish = (event: 'push' | 'workflow_dispatch', exists: boolean): string => {
    const workflow: Workflow = parse(
        readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
    );
    const script = workflow.jobs['aot-release'].steps.find(
        (step) => step.name === '🚚 Publish standalone release'
    )?.run;
    expect(script).toBeDefined();

    const commands = [
        'git() { printf "%s\\n" recovery-sha; }',
        'gh() {',
        '    case "$1 $2" in',
        '        "api --paginate") printf "%s\\n" 0.27.0 ;;',
        '        "release view") test "$RELEASE_EXISTS" = true ;;',
        '        *) printf "gh %s\\n" "$*" ;;',
        '    esac',
        '}',
        script?.replace(GITHUB_EVENT_NAME, event)
    ];

    return execFileSync('bash', ['-euo', 'pipefail', '-c', commands.join('\n')], {
        encoding: 'utf8',
        env: {
            PATH: process.env.PATH,
            GITHUB_REPOSITORY: 'JSPrismarine/JSPrismarine',
            GITHUB_SHA: 'current-sha',
            RELEASE_VERSION: '0.26.0',
            RELEASE_EXISTS: String(exists)
        }
    });
};

describe.skipIf(process.platform !== 'linux')('standalone release publication', () => {
    it.each(['push', 'workflow_dispatch'] as const)('keeps existing release notes on %s', (event) => {
        const output = publish(event, true);

        expect(output).toContain('gh release edit jsprismarine@0.26.0 --title JSPrismarine 0.26.0 --latest=false');
        expect(output).not.toContain('--notes-file');
        expect(output).toContain('gh release upload jsprismarine@0.26.0');
        expect(output).toContain('dist/highlights.md --clobber');
    });

    it('uses the generated notes when creating a release during recovery', () => {
        const output = publish('workflow_dispatch', false);

        expect(output).toContain('gh release create jsprismarine@0.26.0');
        expect(output).toContain('--target recovery-sha');
        expect(output).toContain('--notes-file dist/highlights.md');
    });
});
