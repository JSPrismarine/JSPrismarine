export default class SkinPersonaPieceTintColor {
    private colors: Array<string> = [];
    private pieceType!: string;

    public getColors(): Array<string> {
        return this.colors;
    }

    public getPieceType(): string {
        return this.pieceType;
    }

    public setPieceType(pieceType: string): void {
        this.pieceType = pieceType;
    }
}
