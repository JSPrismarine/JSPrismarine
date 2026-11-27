/**
 * What the server logs when a client fails to join through a fault of the server's: the cause, and
 * a link that opens a GitHub issue filled in with what a maintainer needs to reproduce it.
 *
 * The issue body leaves out the player's name and address, since the operator posts it in public.
 * The log line names them, for the operator.
 */
import { homedir, release, type } from 'node:os';

import type { Logger } from '@jsprismarine/logger';

import type { GitHubIssueReport, IssueSection } from '../diagnostics/GitHubIssueReport';
import { issueUrl } from '../diagnostics/GitHubIssueReport';
import { buildType, serverVersion } from '../version';

/** One failed join, as the edition that saw it describes it. */
export interface JoinFailure {
    readonly edition: 'Bedrock' | 'Java';
    /** The Minecraft versions the client's protocol belongs to, newest last. */
    readonly minecraftVersions: readonly string[];
    readonly protocolVersion: number;
    /** The device the client runs on, when its login said. */
    readonly platform?: string;
    /** Where in the join the connection was, such as `resourcePacks` or `configuration`. */
    readonly phase: string;
    /** What went wrong, as one sentence. */
    readonly cause: string;
    /** The error the server threw, when it threw one. */
    readonly error?: unknown;
    /** The last packets the server sent the client, oldest first. */
    readonly sentPackets?: readonly string[];
}

/** Where the server runs, as the report states it. */
export interface ServerEnvironment {
    readonly version: string;
    readonly build: string;
    readonly os: string;
    readonly runtime: string;
}

/** This server's environment. */
export const serverEnvironment = (): ServerEnvironment => ({
    version: serverVersion(),
    build: buildType(),
    os: `${type()} ${release()} (${process.platform} ${process.arch})`,
    runtime: process.versions.bun === undefined ? `Node.js ${process.version}` : `Bun ${process.versions.bun}`
});

/**
 * An error's stack, or its message when it has none, with the home directory written as `~`, so
 * the report does not carry the operator's user name.
 */
const errorText = (error: unknown, home: string): string => {
    const text = error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error);
    return home.length > 1 ? text.replaceAll(home, '~') : text;
};

/** The client's version as the report names it, such as `1.21.130 (protocol 898)`. */
const clientVersion = ({ minecraftVersions, protocolVersion }: JoinFailure): string =>
    `${minecraftVersions.join(', ') || 'unknown'} (protocol ${protocolVersion})`;

/**
 * The issue a failed join files.
 * @param failure - The failed join.
 * @param environment - Where the server runs, this server by default.
 * @param home - The home directory a stack trace's paths hide, the current user's by default.
 * @returns The report.
 */
export const joinFailureReport = (
    failure: JoinFailure,
    environment: ServerEnvironment = serverEnvironment(),
    home: string = homedir()
): GitHubIssueReport => {
    const client = [
        `- Edition: ${failure.edition}`,
        `- Version: ${clientVersion(failure)}`,
        ...(failure.platform === undefined ? [] : [`- Platform: ${failure.platform}`]),
        `- Join phase: ${failure.phase}`
    ];
    const server = [
        `- JSPrismarine: ${environment.version} (${environment.build})`,
        `- OS: ${environment.os}`,
        `- Runtime: ${environment.runtime}`
    ];
    const sections: IssueSection[] = [
        { heading: 'What happened', text: failure.cause },
        { heading: 'Client', text: client.join('\n') },
        { heading: 'Server', text: server.join('\n') },
        {
            heading: 'Steps to reproduce',
            text: 'Describe how you started the server and joined, and attach your `config.json` if you changed it.'
        }
    ];
    if (failure.error !== undefined)
        sections.push({ heading: 'Error', text: errorText(failure.error, home), code: true });
    if (failure.sentPackets !== undefined && failure.sentPackets.length > 0) {
        sections.push({
            heading: 'Last packets the server sent, oldest first',
            text: failure.sentPackets.join('\n'),
            code: true
        });
    }
    const version = failure.minecraftVersions.at(-1) ?? `protocol ${failure.protocolVersion}`;
    return {
        title: `Bug: ${failure.edition} ${version} client fails to join: ${failure.cause.replace(/\.$/, '')}`,
        labels: ['Bug', 'Networking'],
        sections
    };
};

/** The last names added, at most a set number of them. */
export class RecentNames {
    private readonly names: string[] = [];

    /** @param capacity - How many names it keeps. */
    public constructor(private readonly capacity = 16) {}

    /** Adds a name, dropping the oldest when it holds as many as it keeps. */
    public add(name: string): void {
        if (this.names.length === this.capacity) this.names.shift();
        this.names.push(name);
    }

    /** The names, oldest first. */
    public list(): readonly string[] {
        return [...this.names];
    }
}

/**
 * One connection's join diagnostics: the packets it was last sent, and whether its failure has
 * been reported. A connection reports once, its first failure, since one fault often brings
 * others behind it.
 */
export class JoinDiagnostics {
    /** The last packets the server sent the client. */
    public readonly sent = new RecentNames();
    private reported = false;

    /**
     * Logs the failure and the link to report it, unless the connection reported one already.
     * @param log - Where it is logged.
     * @param who - The player's name and address, for the log line only.
     * @param failure - The failure, without the packets sent, which this adds.
     * @returns Whether it was logged.
     */
    public report(log: Pick<Logger, 'warn'>, who: string, failure: Omit<JoinFailure, 'sentPackets'>): boolean {
        if (this.reported) return false;
        this.reported = true;
        const url = issueUrl(joinFailureReport({ ...failure, sentPackets: this.sent.list() }));
        log.warn(
            `${who} could not join because of a server error: ${failure.cause} ` +
                `Please report it, so it can be fixed. This link opens a GitHub issue with the details filled in, ` +
                `which you can read over before you submit it:\n${url}`
        );
        return true;
    }
}
