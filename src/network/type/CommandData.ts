import type CommandParameter from './CommandParameter';

class CommandData {
    public name!: string;
    public description?: string;
    public flags?: number;
    public permission?: string;
    public aliases?: any[] = [];
    public parameters?: Set<CommandParameter> | Set<CommandParameter>[] = new Set();
}
export default CommandData;
