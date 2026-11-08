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
    if (builtStack !== undefined) return builtStack;

    const world = new TestEntityWorld();
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
    builtStack = { content, runtime, world, reports, reportContext };

    return builtStack;
};

/** The fetched Bedrock and Java content, for scenarios that only read registries, tags and resolved types. */
export const serverContent = (): ServerContent => realStack().content;
