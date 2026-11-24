import java.util.List;
import java.util.function.IntPredicate;

/** A class shaped like the Java code the server copies, compiled into the test fixtures. */
public class Sponge {
    public static final int MAX_DEPTH = 6;
    public static final long BIG = 9007199254740993L;
    public static final List<String> NAMES = List.of("water", "lava");
    public static final IntPredicate WET = depth -> depth < MAX_DEPTH;

    public Runnable early() {
        return () -> System.out.println("early");
    }

    public int absorb(int[] blocks) {
        int absorbed = 0;
        for (int block : blocks) {
            if (WET.test(block) && accepts(block)) absorbed++;
        }
        return absorbed;
    }

    private boolean accepts(int block) {
        switch (block) {
            case 1:
            case 2:
                return true;
            case 40:
                return false;
            default:
                return block > 65;
        }
    }

    public String describe(int block) {
        IntPredicate odd = b -> b % 2 == 1;
        try {
            return odd.test(block) ? "odd" : NAMES.get(block);
        } catch (IndexOutOfBoundsException e) {
            return "none";
        }
    }

    public int unrelated() {
        return 7;
    }

    public synchronized int locked() {
        return 7;
    }

    public int overload(int a) {
        return a;
    }

    public int overload(long a) {
        return (int) a;
    }
}
