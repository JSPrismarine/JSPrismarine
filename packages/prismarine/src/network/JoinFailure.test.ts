import { describe, expect, it } from 'vitest';

import type { JoinFailure, ServerEnvironment } from './JoinFailure';
import { JoinDiagnostics, RecentNames, joinFailureReport } from './JoinFailure';
import { issueBody } from '../diagnostics/GitHubIssueReport';

const ENVIRONMENT: ServerEnvironment = {
    version: '0.21.0',
    build: 'nightly',
    os: 'Linux 6.8.0 (linux x64)',
    runtime: 'Bun 1.3.0'
};

const FAILURE: JoinFailure = {
    edition: 'Bedrock',
    minecraftVersions: ['1.21.130', '1.21.131'],
    protocolVersion: 898,
    platform: 'ANDROID',
    phase: 'resourcePacks',
    cause: "The server failed to handle the client's ResourcePackClientResponsePacket."
};

describe('joinFailureReport', () => {
    it("names the client's version and the server's, and what went wrong", () => {
        const report = joinFailureReport(FAILURE, ENVIRONMENT, '/home/alex');

        expect(report.title).toBe(
            "Bug: Bedrock 1.21.131 client fails to join: The server failed to handle the client's ResourcePackClientResponsePacket"
        );
        expect(report.labels).toEqual(['Bug', 'Networking']);
        const body = issueBody(report);
        expect(body).toContain('- Version: 1.21.130, 1.21.131 (protocol 898)');
        expect(body).toContain('- Platform: ANDROID');
        expect(body).toContain('- Join phase: resourcePacks');
        expect(body).toContain('- JSPrismarine: 0.21.0 (nightly)');
        expect(body).toContain('- Runtime: Bun 1.3.0');
    });

    it("shows the error's stack with the home directory as ~, and the packets the server sent last", () => {
        const error = new Error('boom');
        error.stack = 'Error: boom\n    at handle (/home/alex/JSPrismarine/Handler.ts:1:1)';

        const body = issueBody(
            joinFailureReport(
                { ...FAILURE, error, sentPackets: ['StartGamePacket', 'LevelChunkPacket'] },
                ENVIRONMENT,
                '/home/alex'
            )
        );

        expect(body).toContain('at handle (~/JSPrismarine/Handler.ts:1:1)');
        expect(body).not.toContain('/home/alex');
        expect(body).toContain('```\nStartGamePacket\nLevelChunkPacket\n```');
    });
});

describe('RecentNames', () => {
    it('keeps the newest names, oldest first', () => {
        const names = new RecentNames(2);
        for (const name of ['a', 'b', 'c']) names.add(name);

        expect(names.list()).toEqual(['b', 'c']);
    });
});

describe('JoinDiagnostics', () => {
    it("logs a connection's first failure with the link to report it, and no failure after it", () => {
        const warned: string[] = [];
        const log = { warn: (message: string) => void warned.push(message) };
        const diagnostics = new JoinDiagnostics();
        diagnostics.sent.add('PlayStatusPacket');

        expect(diagnostics.report(log, 'Steve (127.0.0.1:19133)', FAILURE)).toBe(true);
        expect(diagnostics.report(log, 'Steve (127.0.0.1:19133)', { ...FAILURE, cause: 'Another.' })).toBe(false);

        expect(warned).toHaveLength(1);
        const [line] = warned;
        expect(line).toContain(`Steve (127.0.0.1:19133) could not join because of a server error: ${FAILURE.cause}`);
        const body = new URL(line!.slice(line!.indexOf('https://'))).searchParams.get('body')!;
        expect(body).toContain('PlayStatusPacket');
        expect(body).not.toContain('Steve');
        expect(body).not.toContain('127.0.0.1');
    });
});
