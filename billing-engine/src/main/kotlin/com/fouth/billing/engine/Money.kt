package com.fouth.billing.engine

import java.math.BigDecimal
import java.math.RoundingMode

/**
 * The single place that decides how money is rounded.
 *
 * Every bill component (energy, Ft, VAT) is rounded once with these rules; intermediate
 * values such as per-tier amounts stay exact.
 */
object Money {
    const val SCALE = 2
    val ROUNDING: RoundingMode = RoundingMode.HALF_UP

    fun round(value: BigDecimal): BigDecimal = value.setScale(SCALE, ROUNDING)

    /** Parses an amount from text. Never build money from a Double. */
    fun of(text: String): BigDecimal = round(BigDecimal(text))
}
