export default class SkinPersonaPieceTintColor {
    private readonly colors: string[] = [];
    private pieceType!: string;

    public getColors(): string[] {
        return this.colors;
    }

    public getPieceType(): string {
        return this.pieceType;
    }

    public setPieceType(pieceType: string): void {
        this.pieceType = pieceType;
    }
}
