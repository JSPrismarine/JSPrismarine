/**
 * A small typed stage chain for per-connection packet processing - deliberately not Node
 * streams, which buy backpressure and event plumbing this path does not want at the price of
 * untyped `any` boundaries between stages.
 *
 * A stage takes one input and yields zero or more outputs: the batch-split stage fans one
 * frame out into its packets, and a filtering stage drops its input by yielding none. The
 * context is threaded through every stage unchanged, so stateless stages built once can serve
 * every connection; `NetworkDispatcher` passes the `ClientConnection` a frame arrived on.
 *
 * The inbound chain the dispatcher assembles is
 * `frame → decompress/batch-split → decode → log-filter → phase gate → dispatch`. The
 * outbound mirror lives in `MinecraftSession`, whose ordered send chain ends in
 * `TransportConnection.sendFrame`; it is not expressed through this type because its ordering
 * guarantee spans concurrent sends (a batch still compressing must frame before anything
 * requested after it), which is a property of the chain as a whole, not of one item's trip
 * through a stage list.
 */

/**
 * One step of a pipeline: takes one input and the per-run context, yields zero or more
 * outputs for the next stage.
 */
export type Stage<In, Out, Ctx> = (input: In, context: Ctx) => Promise<readonly Out[]> | readonly Out[];

/** Where a pipeline's outputs go: the composed remainder of the chain. */
type Sink<T, Ctx> = (output: T, context: Ctx) => Promise<void>;

/**
 * An assembled chain of {@link Stage}s from `In` to `Out`, built once and run per input.
 *
 * Each item flows through the whole chain before the item behind it enters the stage that
 * produced them - depth-first, not stage-by-stage. The packets of one batch are therefore
 * handled strictly in order, which matters when handling one changes how the next decodes:
 * a `RequestNetworkSettings` and a `Login` arriving in one batch must not both be decoded
 * before the first one's handler has negotiated the codec.
 */
export class Pipeline<In, Out, Ctx> {
    private constructor(private readonly feed: (input: In, context: Ctx, sink: Sink<Out, Ctx>) => Promise<void>) {}

    /**
     * An empty pipeline that yields its input, the seed `pipe` builds on.
     * @returns {Pipeline} the identity pipeline.
     */
    public static start<In, Ctx>(): Pipeline<In, In, Ctx> {
        return new Pipeline(async (input, context, sink) => sink(input, context));
    }

    /**
     * This pipeline with one more stage on the end.
     * @param {Stage} stage - the stage to append.
     * @returns {Pipeline} a new pipeline; the receiver is unchanged.
     */
    public pipe<Next>(stage: Stage<Out, Next, Ctx>): Pipeline<In, Next, Ctx> {
        return new Pipeline(async (input, context, sink) =>
            this.feed(input, context, async (output) => {
                for (const next of await stage(output, context)) await sink(next, context);
            })
        );
    }

    /**
     * Runs one input through every stage.
     * @param {In} input - the input to the first stage.
     * @param {Ctx} context - the per-run context handed to every stage.
     */
    public async run(input: In, context: Ctx): Promise<void> {
        await this.feed(input, context, async () => {});
    }
}
