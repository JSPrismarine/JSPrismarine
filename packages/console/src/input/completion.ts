/** Direction for stepping through completion candidates: 1 forward, -1 backward. */
export type CycleDirection = 1 | -1;

/**
 * Selection over a list of completion candidates.
 *
 * The state is closed until `open` receives at least one candidate. While open, `cycle`
 * moves the selection with wrap-around at both ends, `accept` hands back the selected
 * candidate and closes, and `close` discards everything. `replace` is the text the caller
 * replaces with the chosen candidate, for example the word under the cursor.
 */
export class CompletionState {
    private items: readonly string[] = [];
    private index = 0;
    private replaced = '';

    /** Whether there are candidates to choose from. */
    public get isOpen(): boolean {
        return this.items.length > 0;
    }

    /** Candidates in the order they were opened with; empty while closed. */
    public get candidates(): readonly string[] {
        return this.items;
    }

    /** Index of the selected candidate; 0 while closed. */
    public get selectedIndex(): number {
        return this.index;
    }

    /** The selected candidate, or undefined while closed. */
    public get selected(): string | undefined {
        return this.items[this.index];
    }

    /** The text the selected candidate replaces; empty while closed. */
    public get replace(): string {
        return this.replaced;
    }

    /**
     * Opens the list with the first candidate selected. An empty list leaves the state closed.
     *
     * @param candidates - Replacement texts in display order.
     * @param replace - The text each candidate replaces.
     */
    public open(candidates: readonly string[], replace: string): void {
        this.items = [...candidates];
        this.index = 0;
        this.replaced = candidates.length > 0 ? replace : '';
    }

    /**
     * Moves the selection one step and returns the newly selected candidate. The selection
     * wraps from the last candidate to the first and back.
     *
     * @returns The selected candidate after the move, or undefined while closed.
     */
    public cycle(direction: CycleDirection): string | undefined {
        if (!this.isOpen) return undefined;
        this.index = (this.index + direction + this.items.length) % this.items.length;
        return this.selected;
    }

    /**
     * Closes the list and returns the candidate that was selected.
     *
     * @returns The replacement text, or undefined when the list was already closed.
     */
    public accept(): string | undefined {
        const selected = this.selected;
        this.close();
        return selected;
    }

    /** Discards the candidates and the replaced text. */
    public close(): void {
        this.items = [];
        this.index = 0;
        this.replaced = '';
    }
}
