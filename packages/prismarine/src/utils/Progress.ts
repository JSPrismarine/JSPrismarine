import colorParser from '@jsprismarine/color-parser';

/** Where progress goes when the output is not a terminal. */
export type ProgressLogger = (line: string) => void;

/** Only redraw this often, so the bar does not become the bottleneck it is measuring. */
const REDRAW_INTERVAL_MS = 80;

/** Without a terminal, report at these boundaries instead of redrawing. */
const MILESTONE_PERCENT = 10;

const BAR_WIDTH = 24;

const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;

    return `${Math.floor(seconds / 60)}m${String(Math.round(seconds % 60)).padStart(2, '0')}s`;
};

/**
 * Reports how far a long startup task has got.
 *
 * Renders two ways on purpose. On a terminal it redraws one line in place, which is what
 * anyone watching a server boot expects. Anywhere else - output piped to a file, a service
 * manager, CI - it reports at ten percent boundaries, because a bar redrawn hundreds of
 * times into a log file is hundreds of unreadable lines.
 *
 * Note that this only shows anything if the work between {@link advance} calls yields to
 * the event loop. Nothing here can paint over a blocked loop.
 */
export class Progress {
    private current = 0;
    private lastDrawnAt = 0;
    private lastMilestone = -1;
    private readonly startedAt: number;
    private readonly interactive: boolean;

    public constructor(
        private readonly label: string,
        private readonly total: number,
        private readonly log: ProgressLogger,
        /** Injectable so tests can drive both renderings without a terminal. */
        private readonly stream: NodeJS.WriteStream | undefined = process.stdout,
        isInteractive: boolean = Boolean(process.stdout?.isTTY)
    ) {
        this.startedAt = Date.now();
        this.interactive = isInteractive;
    }

    public get done(): boolean {
        return this.current >= this.total;
    }

    public get percent(): number {
        return this.total === 0 ? 100 : Math.min(100, Math.floor((this.current / this.total) * 100));
    }

    /** Counts completed units and redraws if enough has changed since the last time. */
    public advance(by = 1): void {
        this.current = Math.min(this.current + by, this.total);

        if (this.interactive) {
            const now = Date.now();
            if (now - this.lastDrawnAt < REDRAW_INTERVAL_MS && !this.done) return;
            this.lastDrawnAt = now;
            this.draw();
            return;
        }

        const milestone = Math.floor(this.percent / MILESTONE_PERCENT);
        if (milestone === this.lastMilestone && !this.done) return;
        this.lastMilestone = milestone;
        this.log(`${this.label}: ${this.percent}% (${this.current}/${this.total})`);
    }

    /** Clears the bar and reports the total time. Safe to call more than once. */
    public finish(): void {
        if (this.interactive) this.stream?.write('\x1b[2K\r');
        this.log(`${this.label}: done, ${this.total} in ${formatDuration(Date.now() - this.startedAt)}`);
    }

    private draw(): void {
        const filled = Math.round((this.percent / 100) * BAR_WIDTH);
        const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);

        const elapsed = Date.now() - this.startedAt;
        // Only guess at a remaining time once there is enough done to extrapolate from.
        const eta =
            this.current > 0 && !this.done
                ? `, ~${formatDuration((elapsed / this.current) * (this.total - this.current))} left`
                : '';

        // Labels carry Minecraft colour codes, and this writes straight to the stream rather
        // than through the logger - so the translation the logger's transport does has to
        // happen here too, or the codes show up as a literal section sign in the console.
        const line = colorParser(
            `${this.label} [${bar}] ${String(this.percent).padStart(3)}% (${this.current}/${this.total}${eta})`
        );

        // \x1b[2K clears the whole line first: without it a shorter line leaves the tail of
        // the previous, longer one behind.
        this.stream?.write(`\x1b[2K\r${line}`);
    }
}

export default Progress;
