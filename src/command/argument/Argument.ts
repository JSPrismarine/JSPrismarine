import CommandParameter from '../../network/type/CommandParameter';

export default abstract class Argument {
    public getReadableType(): string {
        return '';
    }
    public getParameters(): Set<CommandParameter> {
        return new Set();
    }
}