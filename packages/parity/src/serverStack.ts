import { buildServerContent } from '@jsprismarine/prismarine/content/ServerContent';
import type { ServerContent } from '@jsprismarine/prismarine/content/ServerContent';
import { singleDimension } from '@jsprismarine/prismarine/content/world/adapter';
import type { ServerWorldAdapter } from '@jsprismarine/prismarine/content/world/adapter';
import { entityContentGroups } from '@jsprismarine/prismarine/entity/contentAdapter';
import { EntityRuntime } from '@jsprismarine/prismarine/entity/data/EntityRuntime';
import { TestEntityWorld } from '@jsprismarine/prismarine/entity/data/testing';

/** The fetched Bedrock and Java content with a live data-driven entity runtime attached. */
export interface RealStack {
    readonly content: ServerContent;
    readonly runtime: EntityRuntime;
    readonly world: TestEntityWorld;
    readonly reports: EntityRuntimeReport[];
    readonly reportContext: EntityReportContext;
}

/** One diagnostic the entity runtime reported, with the entity type that was being exercised. */
export interface EntityRuntimeReport {
    readonly identifier: string | undefined;
    readonly message: string;
}

/** The entity type the next runtime diagnostic is attributed to. */
export interface EntityReportContext {
    identifier: string | undefined;
}

let builtStack: RealStack | undefined;

/** Builds the fetched Bedrock and Java content with a live data-driven entity runtime attached. */
export const realStack = (): RealStack => {
    builtStack ??= buildRealStack(new TestEntityWorld());
    return builtStack;
};

/**
 * Builds a separate stack over the given world, for scenarios that need world state the shared
 * stack does not have, such as a random source that varies.
 */
export const buildRealStack = (world: TestEntityWorld): RealStack => {
    let content: ServerContent | undefined;
    const reports: EntityRuntimeReport[] = [];
    const reportContext: EntityReportContext = { identifier: undefined };
    const runtime = new EntityRuntime({
        content: () => {
            if (content === undefined) throw new Error('the entity runtime was read before the content build finished');
            return content;
        },
        world: world.world,
        host: world.host,
        report: (message) => reports.push({ identifier: reportContext.identifier, message })
    });
    const adapter: ServerWorldAdapter = {
        ...world.world,
        ticks: world.ticks,
        ...entityContentGroups(runtime)
    };

    content = buildServerContent({ world: singleDimension(adapter) });
    return { content, runtime, world, reports, reportContext };
};

/**
 * A fixed run of random draws in [0, 1) from a linear congruential sequence, so a scenario whose
 * rule rolls sees varied draws that are the same on every run.
 * @param count - How many draws; the default is the sequence's 65521 before a world replays it.
 */
export const seededDraws = (count = 65_521): readonly number[] => {
    let state = 0x2545f491;
    return Array.from({ length: count }, () => {
        state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
        return state / 2 ** 32;
    });
};

let varyingStack: RealStack | undefined;

/**
 * A second stack whose world random varies, for a scenario whose rule rolls: the shared stack's
 * world replays 0.5, so a one-in-twenty roll never lands there. The values come from a fixed
 * linear congruential sequence, so every run sees the same draws.
 */
export const varyingRealStack = (): RealStack => {
    if (varyingStack !== undefined) return varyingStack;
    const values = seededDraws();
    varyingStack = buildRealStack(new TestEntityWorld({ random: values }));
    return varyingStack;
};

/** The fetched Bedrock and Java content, for scenarios that only read registries, tags and resolved types. */
export const serverContent = (): ServerContent => realStack().content;
