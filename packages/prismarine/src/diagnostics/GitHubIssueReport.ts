/**
 * A bug report the server writes for its operator, as a link that opens a new GitHub issue with the
 * title, labels and body filled in. The operator reads it over before submitting, so nothing leaves
 * the machine until they do.
 */
import pkg from '../../package.json' with { type: 'json' };

/** One section of the issue body: a heading and its text. */
export interface IssueSection {
    readonly heading: string;
    readonly text: string;
    /** Shows the text in a code block, for a stack trace or a packet list. */
    readonly code?: boolean;
}

/** What a new issue is filled in with. */
export interface GitHubIssueReport {
    readonly title: string;
    readonly labels?: readonly string[];
    readonly sections: readonly IssueSection[];
}

/** Where the package's issues are, from its manifest's `bugs.url`. */
export const ISSUES_URL: string = pkg.bugs.url;

/**
 * The longest link the report makes. GitHub refuses a longer request line with 414, and some
 * terminals and browsers cut a long link short, so this stays under GitHub's limit with room to spare.
 */
export const MAX_ISSUE_URL_LENGTH = 7000;

/** Put where a section's text was cut to fit the link. */
export const TRUNCATED_MARKER = '… (cut short to fit the link; the server log has the rest)';

/** The first `keep` characters of a text, and the marker that says the rest was cut. */
const cut = (text: string, keep: number): string =>
    keep === 0 ? TRUNCATED_MARKER : `${text.slice(0, keep)}\n${TRUNCATED_MARKER}`;

/** The issue title GitHub shows, at most this many characters. */
const MAX_TITLE_LENGTH = 200;

/**
 * Markdown for one section. A code block's fence is longer than any backtick run in the text, so
 * the text cannot close it.
 */
const sectionMarkdown = ({ heading, text, code }: IssueSection): string => {
    if (!code) return `### ${heading}\n\n${text}`;
    const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
    const fence = '`'.repeat(Math.max(3, longestRun + 1));
    return `### ${heading}\n\n${fence}\n${text}\n${fence}`;
};

/**
 * The issue body as Markdown.
 * @param report - The report.
 * @returns The body.
 */
export const issueBody = (report: GitHubIssueReport): string => report.sections.map(sectionMarkdown).join('\n\n');

const linkTo = (report: GitHubIssueReport, issuesUrl: string): string => {
    const params = new URLSearchParams();
    const title =
        report.title.length > MAX_TITLE_LENGTH ? `${report.title.slice(0, MAX_TITLE_LENGTH - 1)}…` : report.title;
    params.set('title', title);
    if (report.labels !== undefined && report.labels.length > 0) params.set('labels', report.labels.join(','));
    params.set('body', issueBody(report));
    return `${issuesUrl.replace(/\/+$/, '')}/new?${params.toString()}`;
};

/**
 * The link that opens a new issue filled in with the report.
 *
 * A link longer than {@link MAX_ISSUE_URL_LENGTH} has its code sections cut from the end, the
 * longest first, until it fits, so the environment and the cause always reach the issue and a long
 * stack trace loses its outer frames.
 * @param report - What the issue says.
 * @param issuesUrl - The repository's issues page, the package's own by default.
 * @returns The link.
 */
export const issueUrl = (report: GitHubIssueReport, issuesUrl: string = ISSUES_URL): string => {
    let sections = [...report.sections];
    const linkWith = (index: number, section: IssueSection, keep: number): string =>
        linkTo({ ...report, sections: sections.with(index, { ...section, text: cut(section.text, keep) }) }, issuesUrl);
    let url = linkTo(report, issuesUrl);
    while (url.length > MAX_ISSUE_URL_LENGTH) {
        const longest = sections.reduce<number | undefined>((best, section, index) => {
            if (!section.code || section.text === TRUNCATED_MARKER) return best;
            return best === undefined || section.text.length > sections[best]!.text.length ? index : best;
        }, undefined);
        // Nothing left to cut: the prose alone is too long, so the title and labels go on their own.
        if (longest === undefined) return linkTo({ ...report, sections: [] }, issuesUrl);
        const section = sections[longest]!;
        // The most of the section's text that fits, found by halving: the link grows with each
        // character kept.
        let low = 0;
        let high = section.text.length - 1;
        while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            if (linkWith(longest, section, mid).length <= MAX_ISSUE_URL_LENGTH) low = mid;
            else high = mid - 1;
        }
        sections = sections.with(longest, { ...section, text: cut(section.text, low) });
        url = linkTo({ ...report, sections }, issuesUrl);
    }
    return url;
};
