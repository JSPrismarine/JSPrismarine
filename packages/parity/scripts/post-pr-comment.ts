import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describeParityTrend, parseDashboardMeasurements, parseDashboardTotals } from '../src/dashboard/trend.ts';
import type { DashboardTotals } from '../src/dashboard/trend.ts';
import { findParityComment } from '../src/dashboard/comments.ts';
import type { IssueComment } from '../src/dashboard/comments.ts';

const COMMENT_MARKER = '<!-- jsprismarine-parity-trend -->';
const GITHUB_API_VERSION = '2026-03-10';
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dashboardPath = join(packageRoot, 'dist', 'dashboard.md');

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isIssueComment = (value: unknown): value is IssueComment => {
    if (!isRecord(value) || typeof value.id !== 'number' || typeof value.body !== 'string' || !isRecord(value.user)) {
        return false;
    }
    return typeof value.user.login === 'string';
};

const requiredEnvironment = (name: string): string => {
    const value = process.env[name];
    if (value === undefined || value === '') throw new Error(`Missing required environment variable: ${name}`);
    return value;
};

const pullRequestNumberFrom = (event: unknown): number => {
    if (!isRecord(event) || !isRecord(event.pull_request) || typeof event.pull_request.number !== 'number') {
        throw new Error('The GitHub event does not contain a pull request number.');
    }
    return event.pull_request.number;
};

const nextPageUrl = (linkHeader: string | null): string | undefined => {
    const nextLink = linkHeader?.split(',').find((link) => link.includes('rel="next"'));
    return nextLink?.match(/<([^>]+)>/)?.[1];
};

const totalsFromComment = (comment: IssueComment | undefined): DashboardTotals | undefined =>
    comment === undefined ? undefined : parseDashboardTotals(comment.body);

const token = requiredEnvironment('GITHUB_TOKEN');
const repository = requiredEnvironment('GITHUB_REPOSITORY');
const apiRoot = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/$/, '');
const event: unknown = JSON.parse(readFileSync(requiredEnvironment('GITHUB_EVENT_PATH'), 'utf8'));
const pullNumber = pullRequestNumberFrom(event);

const request = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/vnd.github+json');
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-GitHub-Api-Version', GITHUB_API_VERSION);

    const response = await fetch(url, { ...init, headers });
    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`GitHub API request failed (${response.status}): ${detail}`);
    }
    return response;
};

const comments: IssueComment[] = [];
let pageUrl: string | undefined = `${apiRoot}/repos/${repository}/issues/${pullNumber}/comments?per_page=100`;

while (pageUrl !== undefined) {
    const response = await request(pageUrl);
    const page: unknown = await response.json();
    if (!Array.isArray(page)) throw new Error('GitHub returned an unexpected pull request comment response.');
    for (const value of page) if (isIssueComment(value)) comments.push(value);
    pageUrl = nextPageUrl(response.headers.get('link'));
}

const previousComment = findParityComment(comments, COMMENT_MARKER);
const previousTotals = totalsFromComment(previousComment);
const previousMeasurements = previousComment === undefined ? [] : parseDashboardMeasurements(previousComment.body);
const dashboard = readFileSync(dashboardPath, 'utf8').trim();
const currentTotals = parseDashboardTotals(dashboard);
const currentMeasurements = parseDashboardMeasurements(dashboard);
const familyDashboard = dashboard.replace(/^# Parity dashboard/, '### Family dashboard');
const body = [
    COMMENT_MARKER,
    '## Parity trend',
    describeParityTrend(previousTotals, currentTotals, previousMeasurements, currentMeasurements),
    familyDashboard
].join('\n\n');

const commentUrl = previousComment
    ? `${apiRoot}/repos/${repository}/issues/comments/${previousComment.id}`
    : `${apiRoot}/repos/${repository}/issues/${pullNumber}/comments`;

await request(commentUrl, {
    method: previousComment === undefined ? 'POST' : 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body })
});

console.log(`${previousComment === undefined ? 'Created' : 'Updated'} the parity report comment on PR #${pullNumber}.`);
