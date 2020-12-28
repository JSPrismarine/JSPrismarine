export default class StringValue {
    private readonly value: string;

    public constructor(value = '') {
        this.value = value;
    }

    public getValue(): string {
        return this.value;
    }
}
