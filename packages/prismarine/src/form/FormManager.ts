import type IForm from './IForm';

export default class FormManager {
    private forms: Map<number, IForm> = new Map() as Map<number, IForm>;

    public addForm(form: IForm): number {
        const id = this.forms.size;
        this.forms.set(id, form);
        return id;
    }

    public getForm(formId: number): IForm | null {
        if (this.forms.has(formId)) {
            return this.forms.get(formId)!;
        }
        return null;
    }

    public deleteForm(formId: number): void {
        this.forms.delete(formId);
    }
}
