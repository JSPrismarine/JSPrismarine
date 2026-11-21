import { describe, expect, it } from 'vitest';

import { parseChangelog } from './changelog.mts';

const repo = 'https://github.com/JSPrismarine/JSPrismarine';
const bullet = (pull: number, sha: string, description: string) =>
    `- [#${pull}](${repo}/pull/${pull}) [\`${sha}\`](${repo}/commit/${sha}0000) Thanks [@someone](https://github.com/someone)! - ${description}`;

const changelog = [
    '# @jsprismarine/prismarine',
    '',
    '## 0.2.0',
    '',
    '### Minor Changes',
    '',
    bullet(12, 'abcdef1', 'Add worlds.\n\n  Each world has its own seed.'),
    '',
    '### Patch Changes',
    '',
    bullet(13, 'abcdef2', 'chore(deps): bump yaml'),
    bullet(14, 'abcdef3', 'Fix the console.'),
    '- Updated dependencies [[`abcdef1`](x)]:',
    '  - @jsprismarine/protocol@0.2.0',
    '',
    '## 0.1.0',
    '',
    '### Major Changes',
    '',
    bullet(10, 'abcdef0', 'First release.'),
    ''
].join('\n');

describe('parseChangelog', () => {
    it('reads each version newest first, with its changes by level and its dependency bumps counted', () => {
        const [newest, oldest] = parseChangelog(changelog);
        expect(newest?.version).toBe('0.2.0');
        expect(newest?.dependencyUpdates).toBe(1);
        expect(newest?.changes).toEqual([
            {
                kind: 'minor',
                description: 'Add worlds.\n\nEach world has its own seed.',
                commit: { sha: 'abcdef1', url: `${repo}/commit/abcdef10000` },
                pullRequest: { number: 12, url: `${repo}/pull/12` }
            },
            {
                kind: 'patch',
                description: 'Fix the console.',
                commit: { sha: 'abcdef3', url: `${repo}/commit/abcdef30000` },
                pullRequest: { number: 14, url: `${repo}/pull/14` }
            }
        ]);
        expect(oldest?.changes.map(({ kind, description }) => [kind, description])).toEqual([
            ['major', 'First release.']
        ]);
    });
});
