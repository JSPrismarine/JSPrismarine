import Server from '../Server';
import withDeprecated from '../hoc/withDeprecated';

export default interface CommandExecuter {
    getServer(): Server;
    sendMessage(message: string, xuid?: string, needTranslation?: string): Promise<void>;
    getName(): string;
    /**
     * @deprecated use `getName()` instead.
     */
    getUsername(): string;
    getFormattedUsername(): string;
    isPlayer(): boolean;
    isOp(): boolean;
}
