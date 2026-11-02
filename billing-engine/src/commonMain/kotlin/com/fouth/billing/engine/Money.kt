package com.fouth.billing.engine

import com.ionspin.kotlin.bignum.decimal.BigDecimal
import com.ionspin.kotlin.bignum.decimal.RoundingMode

/**
 * The single place that decides how money is rounded.
 *
 * Every bill component (energy, Ft, VAT) is rounded once with these rules; intermediate
 * values such as per-tier amounts stay exact.
 */
object Money {
    const val SCALE = 2L

    /** Same as java.math.RoundingMode.HALF_UP: ties go away from zero. */
    val ROUNDING: RoundingMode = RoundingMode.ROUND_HALF_AWAY_FROM_ZERO

    fun round(value: BigDecimal): BigDecimal = value.roundToDigitPositionAfterDecimalPoint(SCALE, ROUNDING)

    /** Parses an amount from text. Never build money from a Double. */
    fun of(text: String): BigDecimal = round(decimal(text))

    /** Formats an amount rounded to exactly two decimals, e.g. "8.70", "-58.00". */
    fun format(value: BigDecimal): String = fixed(round(value), SCALE.toInt())
}

/** Builds an exact decimal from text, the only way amounts and rates enter the engine. */
fun decimal(text: String): BigDecimal = BigDecimal.parseString(text.trim())

/** Writes [value] (already rounded to at most [places] decimals) with exactly [places] decimals. */
internal fun fixed(value: BigDecimal, places: Int): String {
    val plain = value.toStringExpanded()
    val sign = if (plain.startsWith("-")) "-" else ""
    val digits = plain.removePrefix("-")
    val fraction = digits.substringAfter('.', "").padEnd(places, '0')
    return sign + digits.substringBefore('.') + if (places > 0) ".$fraction" else ""
}
