/**
 * The server's releases, read from its changelog. The Releases page renders them with the site's
 * components (`site/releases.data.mts`), and the page's Markdown copy for language models lists them as
 * text (`llmsPages.mts`), so both show the same releases.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { repoRoot } from './project.mts';

/** The server package's changelog. Changesets versions every server package together, so it speaks for all of them. */
export const changelogPath = path.join(repoRoot, 'packages', 'prismarine', 'CHANGELOG.md');

/** Releases shown in full on the Releases page; older ones are linked on GitHub. */
export const SHOWN_RELEASES = 6;

/** What a release changed, by the changeset level that changed it. */
export type ChangeKind = 'major' | 'minor' | 'patch';

/** One changeset in a release, as the changelog writes it. */
export interface ChangelogChange {
    kind: ChangeKind;
    /** The change's description in Markdown, without the commit, pull request and author Changesets put before it. */
    description: string;
    commit?: { sha: string; url: string };
    pullRequest?: { number: number; url: string };
}

/** One version in the changelog, newest first. */
export interface ChangelogRelease {
    version: string;
    changes: ChangelogChange[];
    /** Dependency bumps, counted rather than listed. */
    dependencyUpdates: number;
}

const COMMIT = /\[`([0-9a-f]{7})`\]\((https:\/\/github\.com\/[^)]+\/commit\/[0-9a-f]+)\)/;
const PULL = /\[#(\d+)\]\((https:\/\/github\.com\/[^)]+\/pull\/\d+)\)/;

/** Splits a section into its top-level bullets, keeping each bullet's continuation lines. */
function bullets(section: string) {
    return section
        .split(/^- /m)
        .slice(1)
        .map((bullet) => bullet.replace(/\n {2,}/g, '\n').trim());
}

/**
 * Every version in a Changesets changelog, newest first, with its changes. "Updated dependencies"
 * bullets are dropped, since every server package moves together, and `chore(deps)` changes are counted.
 */
export function parseChangelog(source: string): ChangelogRelease[] {
    return source
        .split(/^## /m)
        .slice(1)
        .map((block) => {
            const [heading = '', ...rest] = block.split('\n');
            const release: ChangelogRelease = { version: heading.trim(), changes: [], dependencyUpdates: 0 };
            for (const section of rest.join('\n').split(/^### /m).slice(1)) {
                const kind = /^(Major|Minor|Patch) Changes/.exec(section)?.[1]?.toLowerCase();
                if (kind !== 'major' && kind !== 'minor' && kind !== 'patch') continue;
                for (const bullet of bullets(section)) {
                    if (bullet.startsWith('Updated dependencies')) continue;
                    // Changesets writes "Thanks @author! - description" after the links.
                    const description = bullet.replace(/^[\s\S]*?Thanks \[@[^\]]+\]\([^)]+\)! - /, '');
                    if (/^chore\(deps\)/.test(description)) {
                        release.dependencyUpdates++;
                        continue;
                    }
                    const commit = COMMIT.exec(bullet);
                    const pull = PULL.exec(bullet);
                    release.changes.push({
                        kind,
                        description,
                        commit: commit?.[1] && commit[2] ? { sha: commit[1], url: commit[2] } : undefined,
                        pullRequest: pull?.[1] && pull[2] ? { number: Number(pull[1]), url: pull[2] } : undefined
                    });
                }
            }
            return release;
        });
}

/** The server's changelog, parsed. */
export const loadChangelog = () => parseChangelog(readFileSync(changelogPath, 'utf8'));

/** Reads the tag date of each server release; a shallow checkout without tags yields none. */
function tagDates() {
    try {
        const refs = execFileSync(
            'git',
            ['for-each-ref', '--format=%(refname:short) %(creatordate:short)', 'refs/tags/@jsprismarine/prismarine@*'],
            { cwd: repoRoot, encoding: 'utf8' }
        );
        return new Map(
            refs
                .trim()
                .split('\n')
                .filter(Boolean)
                .map((line) => {
                    const [ref = '', date = ''] = line.split(' ');
                    return [ref.slice(ref.lastIndexOf('@') + 1), date] as const;
                })
        );
    } catch {
        return new Map<string, string>();
    }
}

/**
 * The day a release's heading entered the changelog, for a release that has no tag of its own. The
 * release commit adds the heading, so the oldest commit that changed its count is the release.
 */
function changelogDate(version: string) {
    try {
        const days = execFileSync('git', ['log', '--format=%cs', '-S', `## ${version}\n`, '--', changelogPath], {
            cwd: repoRoot,
            encoding: 'utf8'
        });
        return days.trim().split('\n').filter(Boolean).at(-1);
    } catch {
        return undefined;
    }
}

/** The day each release was made, `YYYY-MM-DD`: its tag's date, or else the day its heading entered the changelog. */
export function releaseDates() {
    const dates = tagDates();
    return (version: string) => dates.get(version) ?? changelogDate(version);
}

/** The repository's web URL, from the root manifest. */
export function repositoryUrl() {
    // The parsed package.json is an untyped boundary; only the repository URL is read.
    const manifest: { repository: { url: string } } = JSON.parse(
        readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
    );
    return manifest.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
}

/** The changelog's page on GitHub, which lists the releases the Releases page leaves out. */
export const changelogUrl = () =>
    `${repositoryUrl()}/blob/master/${path.relative(repoRoot, changelogPath).split(path.sep).join('/')}`;
