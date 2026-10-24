/**
 * A binary min-heap ordered by a comparator, the few operations the path finder and the chunk
 * sender need. Written in-repo so the class is part of the program rather than an npm module.
 */
export class BinaryHeap<T> {
    private readonly items: T[] = [];

    /**
     * @param compare - Negative when `a` should come out before `b`.
     */
    public constructor(private readonly compare: (a: T, b: T) => number) {}

    public size(): number {
        return this.items.length;
    }

    public push(item: T): void {
        this.items.push(item);
        let index = this.items.length - 1;
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (this.compare(this.items[index]!, this.items[parent]!) >= 0) break;
            this.swap(index, parent);
            index = parent;
        }
    }

    /** Removes and returns the smallest item, or `undefined` when the heap is empty. */
    public pop(): T | undefined {
        const top = this.items[0];
        const last = this.items.pop();
        if (last === undefined || this.items.length === 0) return top;
        this.items[0] = last;
        let index = 0;
        for (;;) {
            const left = index * 2 + 1;
            const right = left + 1;
            let smallest = index;
            if (left < this.items.length && this.compare(this.items[left]!, this.items[smallest]!) < 0) smallest = left;
            if (right < this.items.length && this.compare(this.items[right]!, this.items[smallest]!) < 0)
                smallest = right;
            if (smallest === index) break;
            this.swap(index, smallest);
            index = smallest;
        }
        return top;
    }

    private swap(a: number, b: number): void {
        const item = this.items[a]!;
        this.items[a] = this.items[b]!;
        this.items[b] = item;
    }
}
