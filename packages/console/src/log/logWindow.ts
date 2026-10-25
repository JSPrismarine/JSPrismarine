/**
 * Scroll state for a fixed-height view over a growing list.
 *
 * The window tracks the index of the first painted row, whether it follows the newest row, and how
 * many rows arrived while it was paused. Callers feed it list changes through `onAppended` and
 * `onReset`, and hand it the list in `slice` to pick the rows to paint. It never holds the list.
 */
export class LogWindow {
    private rows: number;
    private total = 0;
    private first = 0;
    private following = true;
    private unreadCount = 0;

    public constructor(height: number) {
        this.rows = Math.max(1, height);
    }

    /** Rows the window paints. */
    public get height(): number {
        return this.rows;
    }

    /** Index of the first painted row. */
    public get offset(): number {
        return this.first;
    }

    /** True while the window sticks to the newest row. */
    public get follow(): boolean {
        return this.following;
    }

    /** Rows appended since follow was paused. Zero while following. */
    public get unread(): number {
        return this.unreadCount;
    }

    /** Scrolls by `rows`; negative scrolls toward older rows and pauses follow. */
    public scrollBy(rows: number): void {
        this.moveTo(this.first + rows);
    }

    /** Scrolls one screen toward older rows, keeping one row of overlap. */
    public pageUp(): void {
        this.scrollBy(-Math.max(1, this.rows - 1));
    }

    /** Scrolls one screen toward newer rows, keeping one row of overlap. */
    public pageDown(): void {
        this.scrollBy(Math.max(1, this.rows - 1));
    }

    /** Scrolls so `index` is in view. Follow resumes only when that reaches the bottom. */
    public scrollTo(index: number): void {
        if (index < this.first) {
            this.moveTo(index);
        } else if (index >= this.first + this.rows) {
            this.moveTo(index - this.rows + 1);
        }
    }

    /** Shows the oldest rows and pauses follow when there is more than one screen. */
    public toTop(): void {
        this.moveTo(0);
    }

    /** Shows the newest rows and resumes follow. */
    public toBottom(): void {
        this.moveTo(this.maxOffset);
    }

    /**
     * Records `count` new rows at the end of the list and `evicted` rows removed from its front.
     * A paused window shifts its offset so the same rows stay in view until it reaches the top.
     */
    public onAppended(count: number, evicted = 0): void {
        this.total += count - evicted;
        if (this.following) {
            this.first = this.maxOffset;
        } else {
            this.first = this.clamp(this.first - evicted);
            this.unreadCount += count;
        }
    }

    /** Replaces the list length after a rebuild, keeping the anchor where possible. */
    public onReset(total: number): void {
        this.total = Math.max(0, total);
        this.unreadCount = 0;
        this.first = this.following ? this.maxOffset : this.clamp(this.first);
    }

    /** Changes the number of painted rows. */
    public onResize(height: number): void {
        this.rows = Math.max(1, height);
        this.first = this.following ? this.maxOffset : this.clamp(this.first);
    }

    /** Picks the rows to paint from the full list. */
    public slice<T>(records: readonly T[]): readonly T[] {
        return records.slice(this.first, this.first + this.rows);
    }

    private get maxOffset(): number {
        return Math.max(0, this.total - this.rows);
    }

    private clamp(offset: number): number {
        return Math.min(this.maxOffset, Math.max(0, offset));
    }

    private moveTo(offset: number): void {
        this.first = this.clamp(offset);
        this.following = this.first === this.maxOffset;
        if (this.following) this.unreadCount = 0;
    }
}
