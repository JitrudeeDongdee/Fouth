package com.fouth.billing.engine

import com.ionspin.kotlin.bignum.decimal.BigDecimal

sealed interface Tariff {
    val code: String
    val serviceCharge: BigDecimal
}

/**
 * One block of a progressive tariff. [upToKwh] is the cumulative upper bound (inclusive)
 * of the block; null means "and above" and is only allowed on the last tier.
 */
data class Tier(val upToKwh: BigDecimal?, val pricePerKwh: BigDecimal)

data class TieredTariff(
    override val code: String,
    val tiers: List<Tier>,
    override val serviceCharge: BigDecimal,
) : Tariff {
    init {
        require(tiers.isNotEmpty()) { "$code: needs at least one tier" }
        require(tiers.last().upToKwh == null) { "$code: last tier must be open-ended" }
        require(tiers.dropLast(1).all { it.upToKwh != null }) { "$code: only the last tier may be open-ended" }
        val bounds = tiers.mapNotNull { it.upToKwh }
        require(bounds.all { it.signum() > 0 }) { "$code: tier bounds must be positive" }
        require(bounds.zipWithNext().all { (a, b) -> b > a }) { "$code: tier bounds must increase" }
        require(tiers.all { it.pricePerKwh.signum() >= 0 }) { "$code: prices must not be negative" }
        require(serviceCharge.signum() >= 0) { "$code: service charge must not be negative" }
    }
}

data class TouTariff(
    override val code: String,
    val peakPerKwh: BigDecimal,
    val offPeakPerKwh: BigDecimal,
    override val serviceCharge: BigDecimal,
) : Tariff {
    init {
        require(peakPerKwh.signum() >= 0 && offPeakPerKwh.signum() >= 0) { "$code: prices must not be negative" }
        require(serviceCharge.signum() >= 0) { "$code: service charge must not be negative" }
    }
}
