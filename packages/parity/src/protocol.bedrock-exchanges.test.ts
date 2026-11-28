// @module-tag integration

/**
 * What JSPrismarine sends a Bedrock client in answer to what it does, against what the pinned
 * Bedrock Dedicated Server of each protocol sent the same client for the same steps
 * ([the verification plan](../../../docs/plans/bedrock-version-verification.md)).
 *
 * `dump:bedrock --pass exchanges --protocol <n>` drives `@jsprismarine/client` through every
 * scenario in `@jsprismarine/client/exchanges/scenarios` against that protocol's pinned server and
 * writes `src/jsp/v<n>/exchanges/<scenario>.json`. This replays the same scenarios against a
 * loopback JSPrismarine, with a client speaking that protocol, and compares. A pull request replays
 * at the primary protocol, `sources.json`'s `defaultProtocolVersion`; the merge group sets
 * `JSP_EXCHANGE_PROTOCOLS=all` and replays at every protocol this build has a codec and captures for.
 */
import { ClientErrors } from '@jsprismarine/errors/client';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ExchangeCapture, ExchangeDriver, ExchangedPacket } from '@jsprismarine/client/exchanges/exchange';
import { exchangeDifferences, runExchange } from '@jsprismarine/client/exchanges/exchange';
import { EXCHANGE_SCENARIOS, EXCHANGE_SETUP } from '@jsprismarine/client/exchanges/scenarios';
import { startLoopbackServer } from '@jsprismarine/client/testing/loopbackServer';
import { resolveProtocolPolicy } from '@jsprismarine/prismarine/network/codec/ProtocolPolicy';
import { beforeAll, it } from 'vitest';

import type { BehaviorScenario } from './behaviorScenarios.ts';
import { measureScenarioScope, scenarioGroup } from './behaviorScenarios.ts';
import { FAMILIES } from './families.ts';
import { bedrockCaptureProtocol, bedrockDataPath } from './goldens.ts';
import { describeFamily } from './measure.ts';

/** How long one `until` waits, in ticks, before the replay gives up on a scenario. */
const UNTIL_TICKS = 600;

/** The protocols with captures under `src/jsp/`, newest first. */
const capturedProtocols = (): number[] =>
    readdirSync(bedrockDataPath('src/jsp'))
        .filter((entry) => /^v\d+$/.test(entry) && existsSync(bedrockDataPath(`src/jsp/${entry}/exchanges`)))
        .map((entry) => Number(entry.slice(1)))
        .sort((a, b) => b - a);

/** Every codec this build can speak: its releases and its preview. */
const buildProtocols = new Set(
    resolveProtocolPolicy({ window: Number.MAX_SAFE_INTEGER, content: 'newest' }).accepted.map(
        (codec) => codec.protocolVersion
    )
);

/** The protocols this run replays at: the primary alone, or every one with captures and a codec. */
const replayed = (): number[] =>
    process.env['JSP_EXCHANGE_PROTOCOLS'] === 'all'
        ? capturedProtocols().filter((protocol) => buildProtocols.has(protocol))
        : [bedrockCaptureProtocol()];

/** What a pinned server sent for one scenario at one protocol, or undefined for a scenario it was never captured on. */
const captureOf = (protocol: number, scenario: string): ExchangeCapture | undefined => {
    const file = bedrockDataPath(join('src/jsp', `v${protocol}`, 'exchanges', `${scenario}.json`));
    if (!existsSync(file)) return undefined;
    // Parsed JSON has no type the compiler can see; the capture pass wrote this shape.
    return JSON.parse(readFileSync(file, 'utf8')) as ExchangeCapture;
};

/** One scenario at one protocol, and what JSPrismarine sent for it. */
interface Replayed {
    readonly protocol: number;
    readonly scenario: (typeof EXCHANGE_SCENARIOS)[number];
    readonly capture: ExchangeCapture | undefined;
    readonly replay: readonly ExchangedPacket[] | Error;
}

/** Runs every scenario against a loopback JSPrismarine with a client speaking `protocol`. */
const replayAt = async (protocol: number): Promise<Replayed[]> => {
    // A window wide enough to admit every release the build has, so an older client is accepted.
    const jsp = await startLoopbackServer({
        name: `exchanges-${protocol}`,
        config: { 'protocol-window': buildProtocols.size }
    });
    const results: Replayed[] = [];
    try {
        for (const line of EXCHANGE_SETUP) await jsp.command(line);
        const player = await jsp.join('ExchangeCapture', protocol);
        const wait = async (ticks: number): Promise<void> => {
            for (let tick = 0; tick < ticks; tick++) {
                await player.input();
                await jsp.tick();
            }
        };
        const driver: ExchangeDriver = {
            client: player.client,
            world: player.world,
            name: player.name,
            command: async (line) => void (await jsp.command(line)),
            wait,
            until: async (condition, what) => {
                for (let tick = 0; !condition(); tick++) {
                    if (tick > UNTIL_TICKS)
                        throw new ClientErrors.ExchangeNeverHappened({ what, ticks: String(UNTIL_TICKS) });
                    await wait(1);
                }
            },
            record: () => {}
        };
        await wait(40);
        for (const scenario of EXCHANGE_SCENARIOS) {
            const capture = captureOf(protocol, scenario.id);
            // A scenario that threw leaves the world where it stopped, so the ones after it run on.
            const replay = await runExchange(scenario, driver).catch((error: unknown) =>
                error instanceof Error ? error : new Error(String(error))
            );
            results.push({ protocol, scenario, capture, replay });
        }
    } finally {
        await jsp.close();
    }
    return results;
};

/**
 * The differences the captures show that JSPrismarine has not closed yet, each by the scenario and
 * a piece of the difference's text. A scenario's row is deferred only while every difference it
 * shows is one of these, so a new difference in the same scenario is still a defect.
 */
const DEFERRED: readonly { readonly scenario: string; readonly shows: string; readonly issue: string }[] = [
    {
        scenario: 'open-chest',
        shows: "InventoryContentPacket's containerId",
        issue: 'https://github.com/JSPrismarine/JSPrismarine/issues/3883'
    },
    {
        scenario: 'open-crafting-table',
        shows: "InventoryContentPacket's containerId",
        issue: 'https://github.com/JSPrismarine/JSPrismarine/issues/3883'
    },
    ...['open-chest', 'open-crafting-table'].flatMap((scenario) =>
        ['InventoryContentPacket, is never sent', "InventoryContentPacket's items.length"].map((shows) => ({
            scenario,
            shows,
            issue: 'https://github.com/JSPrismarine/JSPrismarine/issues/3890'
        }))
    )
];

/** Every way a replay differs from its capture, or the one reason it could not be compared. */
const differencesOf = ({ capture, replay, protocol }: Replayed): string[] => {
    if (capture === undefined) return [`no capture at protocol ${protocol}; run dump:bedrock --pass exchanges`];
    if (replay instanceof Error) return [`the replay stopped: ${replay.message}`];
    return exchangeDifferences(capture.packets, replay);
};

/** The issue a difference waits on, or undefined for one nothing defers. */
const deferralOf = (scenario: string, difference: string): string | undefined =>
    DEFERRED.find((entry) => entry.scenario === scenario && difference.includes(entry.shows))?.issue;

// Without the fetched data the real-data shards restore, the server never finishes the trip into
// the Nether, so the family runs there.
describeFamily(
    FAMILIES.protocolBedrockExchanges,
    [],
    () => {
        const protocols = replayed();
        let replays: Replayed[] = [];

        beforeAll(async () => {
            replays = [];
            for (const protocol of protocols) replays.push(...(await replayAt(protocol)));
        }, 600_000);

        it("sends a Bedrock client what each protocol's pinned server sent it, scenario by scenario", () => {
            // One group a protocol, so a run that replays the primary alone leaves the others' rows be.
            const scenarios: readonly BehaviorScenario<Replayed>[] = protocols.map((replayedAt) => ({
                name: `v${replayedAt}`,
                java: 'The pinned Bedrock Dedicated Server of the protocol answers the scenario with the captured packets.',
                reference: 'packages/bedrock-data/src/jsp/v<protocol>/exchanges',
                subjects: () => replays.filter(({ protocol }) => protocol === replayedAt),
                idOf: ({ scenario }) => scenario.id,
                covers: () => undefined,
                run: (subject) => {
                    const differences = differencesOf(subject);
                    return differences.length === 0 ? undefined : differences.join('; ');
                },
                classify: (subject, difference) => {
                    const issues = differencesOf(subject).map((each) => deferralOf(subject.scenario.id, each));
                    const [issue] = issues;
                    return issue === undefined || issues.some((each) => each === undefined)
                        ? undefined
                        : { kind: 'deferred', reason: difference, reference: issue };
                }
            }));
            measureScenarioScope(
                FAMILIES.protocolBedrockExchanges,
                import.meta.filename,
                new Set(protocols.map((protocol) => `v${protocol}`)),
                [scenarioGroup(scenarios)]
            );
        });
    },
    { tags: ['real-data'] }
);
