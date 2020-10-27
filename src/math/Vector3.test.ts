const Vector3 = require('./Vector3').default;

describe('math', () => {
    describe('Vector3', () => {
        const vector = new Vector3(1.5, 0, 2.75);

        it('should retrieve values correctly', () => {
            expect(vector.getX()).toBe(1.5);
            expect(vector.getY()).toBe(0);
            expect(vector.getZ()).toBe(2.75);
        });
    });
});
