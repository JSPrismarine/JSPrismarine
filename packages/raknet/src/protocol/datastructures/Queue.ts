export default class Queue<T> {
    private readonly elements: T[] = [];
    private head = 0;
    private tail = 0;

    public push(element: T): void {
        this.elements[this.tail] = element;
        this.tail++;
    }

    public pop(): T {
        const item = this.elements[this.head];
        delete this.elements[this.head];
        this.head++;
        return item;
    }

    public peek(): T {
        return this.elements[this.head];
    }

    public get size(): number {
        return this.tail - this.head;
    }

    public get isEmpty(): boolean {
        return this.size === 0;
    }
}
