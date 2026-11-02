package com.fouth.billing.estimate

import com.fouth.billing.engine.decimal
import com.ionspin.kotlin.bignum.decimal.BigDecimal
import com.ionspin.kotlin.bignum.decimal.DecimalMode
import com.ionspin.kotlin.bignum.decimal.RoundingMode

/**
 * A household appliance whose monthly energy use we can estimate from its spec sheet.
 *
 * Estimates are rough by nature: real use depends on the room, the weather and habits.
 * Every assumption is a visible input so the user can change it.
 */
sealed interface Appliance {
    val name: String
    val quantity: Int

    /** Energy for one unit over one day, in kWh (exact, not rounded). */
    fun kwhPerDay(): BigDecimal
}

/** Anything with a power rating in watts: TV, fan, light bulb, rice cooker, computer. */
data class RatedAppliance(
    override val name: String,
    val watts: BigDecimal,
    val hoursPerDay: BigDecimal,
    override val quantity: Int = 1,
) : Appliance {
    init {
        require(watts.signum() >= 0) { "$name: watts must not be negative" }
        requireHours(name, hoursPerDay)
        requireQuantity(name, quantity)
    }

    override fun kwhPerDay(): BigDecimal = watts * hoursPerDay / THOUSAND
}

/**
 * An air conditioner rated in BTU/h with an energy efficiency ratio (EER, BTU/h per watt).
 *
 * Input power = BTU / EER. The compressor does not run flat out the whole time, so the
 * draw is scaled by [loadFactor] (0..1), an assumption the user can change.
 */
data class AirConditioner(
    override val name: String,
    val btuPerHour: BigDecimal,
    val eer: BigDecimal,
    val hoursPerDay: BigDecimal,
    val loadFactor: BigDecimal = decimal("0.7"),
    override val quantity: Int = 1,
) : Appliance {
    init {
        require(btuPerHour.signum() > 0) { "$name: BTU must be positive" }
        require(eer.signum() > 0) { "$name: EER must be positive" }
        require(loadFactor.signum() >= 0 && loadFactor <= BigDecimal.ONE) { "$name: load factor must be 0..1" }
        requireHours(name, hoursPerDay)
        requireQuantity(name, quantity)
    }

    val watts: BigDecimal get() = btuPerHour.divide(eer, DIVISION)

    override fun kwhPerDay(): BigDecimal = watts * loadFactor * hoursPerDay / THOUSAND
}

/**
 * An appliance that runs all day and is best described by the yearly energy on its
 * label, such as a refrigerator with the Thai No. 5 energy label (kWh/year).
 */
data class LabelledAppliance(
    override val name: String,
    val kwhPerYear: BigDecimal,
    override val quantity: Int = 1,
) : Appliance {
    init {
        require(kwhPerYear.signum() >= 0) { "$name: kWh/year must not be negative" }
        requireQuantity(name, quantity)
    }

    override fun kwhPerDay(): BigDecimal = kwhPerYear.divide(DAYS_PER_YEAR, DIVISION)
}

/** One appliance's share of the month. */
data class ApplianceUsage(val appliance: Appliance, val kwhPerMonth: BigDecimal)

data class UsageEstimate(val appliances: List<ApplianceUsage>, val totalKwh: BigDecimal)

/**
 * Adds up appliances into one month of usage.
 *
 * Each appliance's monthly kWh is rounded to two decimals (the precision a person reads
 * on a meter); the total is the sum of those rounded figures, so the lines add up.
 */
object UsageEstimator {
    fun estimate(appliances: List<Appliance>, daysPerMonth: Int = 30): UsageEstimate {
        require(daysPerMonth in 1..31) { "days per month must be 1..31" }
        val days = BigDecimal.fromInt(daysPerMonth)
        val lines = appliances.map { appliance ->
            val kwh = appliance.kwhPerDay() * days * BigDecimal.fromInt(appliance.quantity)
            ApplianceUsage(appliance, kwh.roundToDigitPositionAfterDecimalPoint(2, RoundingMode.ROUND_HALF_AWAY_FROM_ZERO))
        }
        val total = lines.fold(BigDecimal.ZERO) { sum, line -> sum + line.kwhPerMonth }
        return UsageEstimate(lines, total)
    }
}

private val THOUSAND = BigDecimal.fromInt(1000)
private val DAYS_PER_YEAR = BigDecimal.fromInt(365)

/** Enough digits that division never limits the two-decimal kWh result. */
private val DIVISION = DecimalMode(decimalPrecision = 30, roundingMode = RoundingMode.ROUND_HALF_AWAY_FROM_ZERO, scale = 10)

private fun requireHours(name: String, hours: BigDecimal) =
    require(hours.signum() >= 0 && hours <= BigDecimal.fromInt(24)) { "$name: hours per day must be 0..24" }

private fun requireQuantity(name: String, quantity: Int) =
    require(quantity >= 1) { "$name: quantity must be at least 1" }
