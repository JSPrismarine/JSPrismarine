export default class Tag {
    public value: any;
    public name: string;
    public type!: number;

    constructor(value: any, name: string) {
        this.value = value;
        this.name = name;
    }
};
