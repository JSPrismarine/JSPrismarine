import Form from './Form.js';
import { FormType } from './FormType.js';
import Player from '../Player.js';

export default class ModalForm extends Form {
    private content: string;
    private yesButton: string;
    private noButton: string;

    public constructor(
        title: string,
        content: string,
        handler: (player: Player, data: any) => Promise<void>,
        yesButton?: string,
        noButton?: string
    ) {
        super(title, handler);
        this.content = content;
        this.yesButton = yesButton ?? 'gui.yes';
        this.noButton = noButton ?? 'gui.no';
    }

    public getType(): string {
        return FormType.MODAL;
    }

    public serializeContent(): object {
        return {
            content: this.content,
            button1: this.yesButton,
            button2: this.noButton
        };
    }
}
