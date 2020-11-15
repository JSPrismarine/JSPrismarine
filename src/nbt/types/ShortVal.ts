export default class ShortVal {
    private value: number;

    public constructor(value: number = 0) {
        this.value = value;
    }

    public getValue(): number {
        return this.value;
    }
}
