import { describe, expect, it } from 'vitest';

import type { GitHubIssueReport } from './GitHubIssueReport';
import { ISSUES_URL, MAX_ISSUE_URL_LENGTH, TRUNCATED_MARKER, issueBody, issueUrl } from './GitHubIssueReport';

const report = (stack = 'Error: boom\n    at handle (Handler.ts:1:1)'): GitHubIssueReport => ({
    title: 'Bug: something broke',
    labels: ['Bug', 'Networking'],
    sections: [
        { heading: 'What happened', text: 'The server threw.' },
        { heading: 'Error', text: stack, code: true }
    ]
});

describe('issueUrl', () => {
    it("opens a new issue on the package's tracker, filled in with the title, labels and body", () => {
        const url = new URL(issueUrl(report()));

        expect(`${url.origin}${url.pathname}`).toBe(`${ISSUES_URL}/new`);
        expect(url.searchParams.get('title')).toBe('Bug: something broke');
        expect(url.searchParams.get('labels')).toBe('Bug,Networking');
        expect(url.searchParams.get('body')).toBe(
            '### What happened\n\nThe server threw.\n\n### Error\n\n```\nError: boom\n    at handle (Handler.ts:1:1)\n```'
        );
    });

    it('cuts a long code section from the end to fit the link, and keeps the prose whole', () => {
        const frames = Array.from({ length: 2000 }, (_, i) => `    at frame${i} (file${i}.ts:1:1)`);
        const url = issueUrl(report(['Error: boom', ...frames].join('\n')));

        expect(url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH);
        const body = new URL(url).searchParams.get('body')!;
        expect(body).toContain('The server threw.');
        expect(body).toContain('Error: boom\n    at frame0 ');
        expect(body).toContain(TRUNCATED_MARKER);
        expect(body).not.toContain('frame1999');
    });

    it('fits however the code section encodes', () => {
        // Every character of these takes nine once percent-encoded.
        const url = issueUrl(report('…'.repeat(5000)));

        expect(url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH);
        expect(new URL(url).searchParams.get('body')).toContain(TRUNCATED_MARKER);
    });
});

describe('issueBody', () => {
    it('fences a code section with more backticks than its text holds', () => {
        expect(issueBody({ title: '', sections: [{ heading: 'Log', text: 'a ``` b', code: true }] })).toBe(
            '### Log\n\n````\na ``` b\n````'
        );
    });
});
