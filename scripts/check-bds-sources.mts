/**
 * Checks what the source says about the Bedrock Dedicated Server against what the repository
 * holds of it ([the verification plan](../docs/plans/bedrock-version-verification.md)).
 *
 * Two rules, over every package's non-test source:
 *
 * - A `@bdsSee <scenario>` tag names an exchange the primary protocol has a capture of, under
 *   `packages/bedrock-data/src/jsp/v<primary>/exchanges/<scenario>.json`, which
 *   `dump:bedrock --pass exchanges` writes and the `protocol.bedrock-exchanges` family replays.
 * - No prose names a BDS version, such as "Bedrock Dedicated Server 1.26.60.6", on one line or
 *   wrapped across two. A claim about a
 *   pinned server names its protocol ("protocol 2225's pinned server"), whose version
 *   `sources.json` holds, or tags the exchange that shows it; a claim about a server no pin holds
 *   says so ("an unpinned Bedrock Dedicated Server").
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** A BDS version written into prose. */
export const BDS_VERSION = /\b(?:Bedrock Dedicated Server|BDS)(?: build)? \d+\.\d+\.\d+(?:\.\d+)?/g;

/** What starts a comment's continuation line: its indent and its `*` or `//`. */
const COMMENT_LEADER = /^\s*(?:\*(?!\/)|\/\/)?\s*/;

/** A tag naming the exchange a claim rests on. */
export const BDS_SEE_TAG = /@bdsSee\s+([\w-]+)/g;

/** One finding, as the check prints it. */
export interface BdsSourceProblem {
    readonly file: string;
    readonly line: number;
    readonly message: string;
}

/**
 * The problems in one file's text.
 * @param file - Its path, for the messages.
 * @param text - Its contents.
 * @param captured - Whether the primary protocol has a capture of the named scenario.
 */
export const bdsSourceProblems = (
    file: string,
    text: string,
    captured: (scenario: string) => boolean
): BdsSourceProblem[] => {
    const problems: BdsSourceProblem[] = [];
    const lines = text.split('\n');
    const versionProblem = (line: number, cited: string): BdsSourceProblem => ({
        file,
        line,
        message: `"${cited}" names a version: name the pin by its protocol, tag the exchange with @bdsSee, or call the server unpinned`
    });
    lines.forEach((content, index) => {
        for (const match of content.matchAll(BDS_VERSION)) problems.push(versionProblem(index + 1, match[0]));
        // A comment that wraps between the server's name and its version: the next line joined on
        // without its comment leader, keeping only a match that crosses the break.
        const next = lines[index + 1];
        if (next !== undefined) {
            const joined = `${content.trimEnd()} ${next.replace(COMMENT_LEADER, '')}`;
            const at = content.trimEnd().length;
            for (const match of joined.matchAll(BDS_VERSION)) {
                if (match.index < at && match.index + match[0].length > at) {
                    problems.push(versionProblem(index + 1, match[0]));
                }
            }
        }
        for (const match of content.matchAll(BDS_SEE_TAG)) {
            const scenario = match[1] ?? '';
            if (!captured(scenario)) {
                problems.push({
                    file,
                    line: index + 1,
                    message: `@bdsSee ${scenario} names no exchange the primary protocol has a capture of; run dump:bedrock --pass exchanges`
                });
            }
        }
    });
    return problems;
};

/** Whether a tracked path is package source the check reads: not a test, a test helper or generated output. */
export const isCheckedSource = (file: string): boolean =>
    /^packages\/[^/]+\/src\/.*\.[cm]?tsx?$/.test(file) &&
    !/\.test(?:-utils|\.helper)?\.[cm]?tsx?$/.test(file) &&
    !file.includes('/generated/');

if (import.meta.filename === process.argv[1]) {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const bedrockData = path.join(repoRoot, 'packages', 'bedrock-data');
    // Parsed JSON has no type the compiler can see; this is the one field read here.
    const sources = JSON.parse(readFileSync(path.join(bedrockData, 'sources.json'), 'utf8')) as {
        bds: { defaultProtocolVersion: number };
    };
    const exchanges = path.join(bedrockData, 'src', 'jsp', `v${sources.bds.defaultProtocolVersion}`, 'exchanges');
    const captured = (scenario: string): boolean => existsSync(path.join(exchanges, `${scenario}.json`));

    const files = execFileSync('git', ['ls-files', 'packages'], { cwd: repoRoot, encoding: 'utf8' })
        .split('\n')
        .filter(isCheckedSource);
    const problems = files.flatMap((file) =>
        bdsSourceProblems(file, readFileSync(path.join(repoRoot, file), 'utf8'), captured)
    );
    for (const { file, line, message } of problems) console.error(`${file}:${line}: ${message}`);
    if (problems.length > 0) {
        console.error(`\n${problems.length} BDS citation problem(s). See docs/plans/bedrock-version-verification.md.`);
        process.exit(1);
    }
    const tags = files.reduce(
        (count, file) => count + [...readFileSync(path.join(repoRoot, file), 'utf8').matchAll(BDS_SEE_TAG)].length,
        0
    );
    console.log(`${tags} @bdsSee tags resolve, and no source names a BDS version (${files.length} files checked).`);
}
