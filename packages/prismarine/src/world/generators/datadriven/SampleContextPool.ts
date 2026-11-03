import { SampleContext } from '@jsprismarine/worldgen';

/** A small task-local context cache owned by one data-driven generator instance. */
const MAX_RETAINED_CONTEXTS = 2;

/** @internal A bounded pool for worker-local terrain sampling contexts. */
export class SampleContextPool {
    private readonly available: SampleContext[] = [];

    /** Takes a clean context, allocating one when all retained contexts are in use. */
    public acquire(): SampleContext {
        return this.available.pop() ?? new SampleContext();
    }

    /** Clears chunk state and keeps at most two contexts for the next terrain tasks. */
    public release(context: SampleContext): void {
        context.reset();
        // reset() preserves caller overrides for its public cache-reset contract; pooled contexts
        // must drop chunk-specific closures so the previous beard and blender are not retained.
        context.blendAlpha = undefined;
        context.blendOffset = undefined;
        context.blendDensity = undefined;
        context.beardifier = undefined;

        if (this.available.length < MAX_RETAINED_CONTEXTS) this.available.push(context);
    }
}
