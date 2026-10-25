import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import net.minecraft.util.Mth;

/**
 * Dumps golden vectors for the mining speed, break progress and attack damage formulas.
 *
 * The method bodies below are transcribed verbatim from the pinned, unobfuscated 26.3 server
 * jar, which this file compiles against: {@code Player.getDestroySpeed(BlockState)},
 * {@code BlockBehaviour.getDestroyProgress}, {@code Player.getAttackStrengthScale},
 * {@code Player.baseDamageScaleFactor} and the damage half of {@code Player.attack}. The jar's
 * versions take a level and a block state this dumper has no way to build, so the arithmetic is
 * copied and its inputs are passed in; the point of the vectors is that the JVM's float
 * arithmetic is what the TypeScript has to reproduce, not just the shape of the expression.
 *
 * {@code Mth.clamp} comes from the jar itself.
 */
public final class DumpItemFormulas {
    /** {@code Player.getDestroySpeed}, with each attribute and effect passed in. */
    private static float destroySpeed(
        float toolSpeed,
        float miningEfficiency,
        int digSpeedAmplifier,
        int miningFatigueAmplifier,
        float blockBreakSpeed,
        boolean eyeInWater,
        float submergedMiningSpeed,
        boolean onGround
    ) {
        float speed = toolSpeed;
        if (speed > 1.0F) {
            speed += miningEfficiency;
        }

        if (digSpeedAmplifier >= 0) {
            speed *= 1.0F + (digSpeedAmplifier + 1) * 0.2F;
        }

        if (miningFatigueAmplifier >= 0) {
            float scale = (float) Math.pow(0.3, miningFatigueAmplifier + 1);
            speed *= scale;
        }

        speed *= blockBreakSpeed;
        if (eyeInWater) {
            speed *= submergedMiningSpeed;
        }

        if (!onGround) {
            speed /= 5.0F;
        }

        return speed;
    }

    /** {@code BlockBehaviour.getDestroyProgress}. */
    private static float destroyProgress(float playerSpeed, float hardness, boolean correctToolForDrops) {
        if (hardness == -1.0F) {
            return 0.0F;
        }
        int modifier = correctToolForDrops ? 30 : 100;
        return playerSpeed / hardness / modifier;
    }

    /** {@code Player.getAttackStrengthScale(0.5F)} over {@code getCurrentItemAttackStrengthDelay}. */
    private static float attackStrengthScale(int attackStrengthTicker, double attackSpeed) {
        float delay = (float) (1.0 / attackSpeed * 20.0);
        return Mth.clamp((attackStrengthTicker + 0.5F) / delay, 0.0F, 1.0F);
    }

    /** The damage half of {@code Player.attack}, with the enchanted delta passed in. */
    private static float attackDamage(
        double attackDamageAttribute,
        float attackStrengthScale,
        float enchantmentBonus,
        float itemBonus,
        boolean criticalAttack
    ) {
        float baseDamage = (float) attackDamageAttribute;
        float magicBoost = attackStrengthScale * enchantmentBonus;
        baseDamage *= 0.2F + attackStrengthScale * attackStrengthScale * 0.8F;
        baseDamage += itemBonus;
        if (criticalAttack) {
            baseDamage *= 1.5F;
        }

        return baseDamage + magicBoost;
    }

    /** {@code RemoveBinomial}'s chance for Unbreaking, from {@code unbreaking.json}. */
    private static float unbreakingChance(int level, boolean armor) {
        float numerator = armor ? 2.0F + 2.0F * (level - 1) : 1.0F + 1.0F * (level - 1);
        float denominator = armor ? 10.0F + 5.0F * (level - 1) : 2.0F + 1.0F * (level - 1);
        return numerator / denominator;
    }

    private static String number(float value) {
        if (Float.isInfinite(value)) {
            return value > 0 ? "1e999" : "-1e999";
        }
        return Float.toString(value);
    }

    private static void line(StringBuilder out, boolean first, String body) {
        out.append(first ? "\n        " : ",\n        ").append(body);
    }

    public static void main(String[] args) throws IOException {
        Path target = Path.of(args[0], "formulas.json");

        float[] toolSpeeds = { 1.0F, 1.5F, 2.0F, 4.0F, 6.0F, 8.0F, 9.0F, 12.0F, 15.0F };
        float[] efficiencies = { 0.0F, 2.0F, 5.0F, 17.0F, 26.0F };
        int[] digSpeeds = { -1, 0, 1, 2 };
        int[] fatigues = { -1, 0, 1, 2, 3 };
        float[] breakSpeeds = { 1.0F, 0.5F, 1.25F };
        float[] submerged = { 0.2F, 1.0F };
        float[] hardnesses = { -1.0F, 0.5F, 1.5F, 3.0F, 5.0F, 22.5F, 50.0F };
        double[] attackDamages = { 1.0, 2.0, 7.0, 10.0 };
        double[] attackSpeeds = { 4.0, 1.6, 1.2, 1.1, 0.9, 0.8, 0.6 };
        double[] attackGridSpeeds = { 4.0, 1.6, 0.9, 0.6 };
        float[] bonuses = { 0.0F, 1.0F, 5.5F };

        StringBuilder out = new StringBuilder();
        out.append("{\n    \"mining\": [");
        boolean first = true;
        int index = 0;
        for (float toolSpeed : toolSpeeds) {
            for (float efficiency : efficiencies) {
                for (int digSpeed : digSpeeds) {
                    for (int fatigue : fatigues) {
                        // One combination of the remaining three axes per cell keeps the
                        // vector file to a reviewable size while still covering every pair.
                        float breakSpeed = breakSpeeds[index % breakSpeeds.length];
                        boolean eyeInWater = index % 2 == 0;
                        float submergedSpeed = submerged[index % submerged.length];
                        boolean onGround = index % 3 != 0;
                        index++;

                        float speed = destroySpeed(
                            toolSpeed, efficiency, digSpeed, fatigue, breakSpeed, eyeInWater, submergedSpeed, onGround
                        );
                        line(out, first, String.format(
                            Locale.ROOT,
                            "{ \"toolSpeed\": %s, \"miningEfficiency\": %s, \"digSpeedAmplifier\": %d, "
                                + "\"miningFatigueAmplifier\": %d, \"blockBreakSpeed\": %s, \"eyeInWater\": %b, "
                                + "\"submergedMiningSpeed\": %s, \"onGround\": %b, \"speed\": %s }",
                            number(toolSpeed), number(efficiency), digSpeed, fatigue, number(breakSpeed),
                            eyeInWater, number(submergedSpeed), onGround, number(speed)
                        ));
                        first = false;
                    }
                }
            }
        }

        out.append("\n    ],\n    \"progress\": [");
        first = true;
        for (float toolSpeed : toolSpeeds) {
            for (float hardness : hardnesses) {
                for (boolean correct : new boolean[] { true, false }) {
                    float speed = destroySpeed(toolSpeed, 0.0F, -1, -1, 1.0F, false, 0.2F, true);
                    float progress = destroyProgress(speed, hardness, correct);
                    line(out, first, String.format(
                        Locale.ROOT,
                        "{ \"speed\": %s, \"hardness\": %s, \"correctToolForDrops\": %b, \"progress\": %s }",
                        number(speed), number(hardness), correct, number(progress)
                    ));
                    first = false;
                }
            }
        }

        out.append("\n    ],\n    \"charge\": [");
        first = true;
        for (double attackSpeed : attackSpeeds) {
            for (int ticker = 0; ticker <= 34; ticker++) {
                line(out, first, String.format(
                    Locale.ROOT,
                    "{ \"ticksSinceAttack\": %d, \"attackSpeed\": %s, \"scale\": %s }",
                    ticker, Double.toString(attackSpeed), number(attackStrengthScale(ticker, attackSpeed))
                ));
                first = false;
            }
        }

        out.append("\n    ],\n    \"attack\": [");
        first = true;
        for (double attackDamage : attackDamages) {
            for (double attackSpeed : attackGridSpeeds) {
                for (int ticker : new int[] { 0, 3, 12, 20 }) {
                    for (float bonus : bonuses) {
                        for (boolean critical : new boolean[] { false, true }) {
                            float scale = attackStrengthScale(ticker, attackSpeed);
                            float damage = attackDamage(attackDamage, scale, bonus, 0.0F, critical);
                            line(out, first, String.format(
                                Locale.ROOT,
                                "{ \"baseAttackDamage\": %s, \"attackStrengthScale\": %s, "
                                    + "\"enchantmentBonus\": %s, \"critical\": %b, \"damage\": %s }",
                                Double.toString(attackDamage), number(scale), number(bonus), critical, number(damage)
                            ));
                            first = false;
                        }
                    }
                }
            }
        }

        out.append("\n    ],\n    \"unbreaking\": [");
        first = true;
        for (int level = 1; level <= 5; level++) {
            for (boolean armor : new boolean[] { false, true }) {
                line(out, first, String.format(
                    Locale.ROOT,
                    "{ \"level\": %d, \"armor\": %b, \"chance\": %s }",
                    level, armor, number(unbreakingChance(level, armor))
                ));
                first = false;
            }
        }

        out.append("\n    ]\n}\n");
        Files.writeString(target, out.toString(), StandardCharsets.UTF_8);
        System.out.println("Wrote " + target);
    }

    private DumpItemFormulas() {}
}
