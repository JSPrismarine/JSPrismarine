export default class ShortValue {
    private readonly value: number;

    public constructor(value = 0) {
        this.value = value;
    }

    public getValue(): number {
        return this.value;
    }
}
