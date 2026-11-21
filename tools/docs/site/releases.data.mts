import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createMarkdownRenderer } from 'vitepress';

import { changelogUrl, loadChangelog, releaseDates, repositoryUrl, SHOWN_RELEASES } from '../changelog.mts';
import { repoRoot } from '../project.mts';

/** Versions read for the landing page's release line, patches included, so it has feature releases to show. */
const HISTORY_RELEASES = 14;

/** Characters of body text after a note's lead sentence beyond which the body folds behind "Details". */
const FOLD_AFTER = 360;

/** One changeset in a release. */
export interface ReleaseChange {
    /** Rendered HTML of the change's description. */
    html: string;
    /** The description's first sentence as plain text, for teasers. */
    summary: string;
    /** Whether the change breaks or removes something an upgrader has to act on. */
    breaking: boolean;
    commit?: { sha: string; url: string };
    pullRequest?: { number: number; url: string };
}

/** One version of the server, newest first. */
export interface Release {
    version: string;
    /** The day the release was tagged, when the checkout has its tag. */
    date?: string;
    kind: 'major' | 'minor' | 'patch';
    major: ReleaseChange[];
    minor: ReleaseChange[];
    patch: ReleaseChange[];
    /** Dependency bumps, counted rather than listed. */
    dependencyUpdates: number;
}

/** A release in brief, for the landing page's release line: enough to draw a stop and say what it brought. */
export interface ReleaseSummary {
    version: string;
    /** The day the release was tagged, when the checkout has its tag. */
    date?: string;
    kind: Release['kind'];
    /** How many changes the release holds, dependency bumps aside. */
    changes: number;
    /** How many of those break or remove something. */
    breaking: number;
    dependencyUpdates: number;
    /** The first sentences of its first changes. */
    highlights: string[];
    /** Whether the releases page shows this release in full, so a link can point at it there. */
    shownInFull: boolean;
}

export interface ReleaseData {
    releases: Release[];
    /** The newest versions in brief, newest first, reaching further back than `releases` does. */
    history: ReleaseSummary[];
    /** Every version in the changelog, including those not shown in full. */
    totalReleases: number;
    changelogUrl: string;
    /** Changesets merged since the newest release that name the server: what the next release holds so far. */
    pending: number;
    /** Where those waiting changesets can be read. */
    pendingUrl: string;
}

/** Counts the changesets waiting for a release whose front matter names the server package. */
function pendingChangesets() {
    const directory = path.join(repoRoot, '.changeset');
    return readdirSync(directory)
        .filter((file) => file.endsWith('.md') && file !== 'README.md')
        .filter((file) => {
            const frontMatter = readFileSync(path.join(directory, file), 'utf8').split('---')[1] ?? '';
            return frontMatter.includes('@jsprismarine/prismarine');
        }).length;
}

/** The first sentence of a Markdown description, with code spans and links reduced to their text. */
function firstSentence(markdown: string) {
    const text = markdown
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    return /^.+?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;
}

async function load(): Promise<ReleaseData> {
    const md = await createMarkdownRenderer(repoRoot);
    const dateOf = releaseDates();
    const versions = loadChangelog();

    const parsed = versions.slice(0, Math.max(SHOWN_RELEASES, HISTORY_RELEASES)).map((entry): Release => {
        const release: Release = {
            version: entry.version,
            date: dateOf(entry.version),
            kind: 'patch',
            major: [],
            minor: [],
            patch: [],
            dependencyUpdates: entry.dependencyUpdates
        };
        for (const { kind, description, commit, pullRequest } of entry.changes) {
            const html = markChange(md.render(description));
            release[kind].push({
                html,
                breaking: html.includes('release__breaking'),
                summary: firstSentence(description),
                commit,
                pullRequest
            });
        }
        release.kind = release.major.length ? 'major' : release.minor.length ? 'minor' : 'patch';
        return release;
    });

    const releases = parsed.slice(0, SHOWN_RELEASES);
    const history = parsed.map((release, index): ReleaseSummary => {
        const changes = [...release.major, ...release.minor, ...release.patch];
        return {
            version: release.version,
            date: release.date,
            kind: release.kind,
            changes: changes.length,
            breaking: changes.filter((change) => change.breaking).length,
            dependencyUpdates: release.dependencyUpdates,
            highlights: changes.slice(0, 3).map((change) => change.summary),
            shownInFull: index < SHOWN_RELEASES
        };
    });

    return {
        releases,
        history,
        pending: pendingChangesets(),
        pendingUrl: `${repositoryUrl()}/tree/master/.changeset`,
        totalReleases: versions.length,
        changelogUrl: changelogUrl()
    };
}

declare const data: ReleaseData;
export { data };

/**
 * Marks up a rendered change for scanning: its opening sentence becomes a lead-in, when that sentence
 * is plain text, a long body after it folds behind "Details", and the paragraphs that break or remove
 * something fold into a labeled disclosure the notes set apart.
 */
function markChange(html: string) {
    return (
        html
            .replace(/^<p>((?:[^<.!?]|<[^>]+>)+?[.!?])(?=\s|<\/p>)/, '<p><strong class="release__lead">$1</strong>')
            .replace(/<p>(?=(?:Breaking|Removed)\b)/g, '<p class="release__breaking">')
            // The notes label these paragraphs, so a leading "Breaking:" would say it twice.
            .replace(/<p class="release__breaking">Breaking:\s*/g, '<p class="release__breaking">')
            // A breaking note lists removed names, which only upgraders need, so it folds behind its label.
            .replace(
                /<p class="release__breaking">([\s\S]*?)<\/p>/g,
                '<details class="release__breaking"><summary>Breaking<span class="release__fold-more">: what to update</span></summary><p>$1</p></details>'
            )
            // A long note keeps its lead sentence in view and folds what follows, up to its first breaking
            // note, so the list stays scannable.
            .replace(
                /^(<p><strong class="release__lead">[\s\S]*?<\/strong>)([\s\S]*?)(?=<details class="release__breaking"|$)/,
                (note, lead: string, body: string) =>
                    body.replace(/<[^>]+>/g, '').trim().length > FOLD_AFTER
                        ? `${lead}</p><details class="release__details"><summary>Details</summary><p>${body.trimStart()}</details>`
                        : note
            )
            // A note's folds share one row, so a note with both costs one line, not two.
            .replace(
                /(?:<details class="release__(?:details|breaking)">[\s\S]*?<\/details>\s*){2,}/g,
                (folds) => `<div class="release__folds">${folds}</div>`
            )
    );
}

export default {
    watch: ['../../../packages/prismarine/CHANGELOG.md', '../../../.changeset/*.md'],
    load
};
