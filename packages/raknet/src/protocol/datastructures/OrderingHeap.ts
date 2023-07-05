export interface IOrderedElement {
    weight: number;
}

export default class OrderingHeap<T extends IOrderedElement> {
    private heap: (T | undefined)[] = [];
    private index = 0;

    public insert(weight: number, element: T) {
        this.heap[this.index] = element;
        this.heap[this.index]!.weight = weight;
        this.shiftUp(this.index);
        this.index++;
    }

    public peek(): T {
        return this.heap[0]!;
    }

    public pop(startingIndex: number): T {
        const retVal = this.heap[startingIndex];

        this.index--;
        this.heap[startingIndex] = this.heap[this.index];
        this.heap[this.index] = void 0;

        this.shiftDown(startingIndex);

        return retVal!;
    }

    public get size(): number {
        return this.index;
    }

    private shiftUp(size: number): void {
        while (true) {
            if (size === 0 || this.heap[size >> 1]!.weight <= this.heap[size]!.weight) {
                return;
            }

            const tmp = this.heap[size];
            this.heap[size] = this.heap[size >> 1];
            this.heap[size >> 1] = tmp;

            size = size >> 1;
        }
    }

    private shiftDown(size: number): void {
        let child: number;
        while (true) {
            child = size << 1;
            if (child >= this.index) {
                return;
            }

            if (child + 1 < this.index && this.heap[child]!.weight > this.heap[child + 1]!.weight) {
                child++;
            }

            if (this.heap[size]!.weight > this.heap[child]!.weight) {
                const tmp = this.heap[size];
                this.heap[size] = this.heap[child];
                this.heap[child] = tmp;
            } else {
                return;
            }
        }
    }
}
