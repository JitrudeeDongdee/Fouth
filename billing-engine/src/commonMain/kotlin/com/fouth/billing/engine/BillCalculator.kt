package com.fouth.billing.engine

import com.ionspin.kotlin.bignum.decimal.BigDecimal

/** One priced block of energy. [amount] is exact; rounding happens on the bill total. */
data class EnergyLine(
    val label: String,
    val kwh: BigDecimal,
    val pricePerKwh: BigDecimal,
) {
    val amount: BigDecimal get() = kwh * pricePerKwh
}

/**
 * How much of one month's usage falls in one tier of a progressive tariff. Every tier of
 * the tariff gets one, in order; a tier the usage does not reach has [kwh] zero.
 * [toKwh] is null for the open-ended last tier.
 */
data class TierUse(
    val fromKwh: BigDecimal,
    val toKwh: BigDecimal?,
    val pricePerKwh: BigDecimal,
    val kwh: BigDecimal,
) {
    val amount: BigDecimal get() = kwh * pricePerKwh
    val label: String get() = if (toKwh == null) "${fromKwh.toStringExpanded()}+" else "${fromKwh.toStringExpanded()}-${toKwh.toStringExpanded()}"
}

data class BillBreakdown(
    val rates: ResolvedRates,
    val totalKwh: BigDecimal,
    val energyLines: List<EnergyLine>,
    val energyCharge: BigDecimal,
    val serviceCharge: BigDecimal,
    val ftCharge: BigDecimal,
    val subtotal: BigDecimal,
    val vat: BigDecimal,
    val total: BigDecimal,
)

/**
 * Prices one month of usage against resolved rates.
 *
 * subtotal = energy + service charge + Ft, VAT is charged on the subtotal, and each of
 * energy, Ft and VAT is rounded once with [Money] rules.
 */
object BillCalculator {

    fun calculate(usage: Usage, rates: ResolvedRates): BillBreakdown {
        val lines = when (val tariff = rates.tariff) {
            is TieredTariff -> tieredLines(tariff, requireUsage<Usage.Total>(usage, tariff).kwh)
            is TouTariff -> touLines(tariff, requireUsage<Usage.TimeOfUse>(usage, tariff))
        }
        val energy = Money.round(lines.fold(BigDecimal.ZERO) { sum, line -> sum + line.amount })
        val service = Money.round(rates.tariff.serviceCharge)
        val ft = Money.round(usage.totalKwh * rates.ftPerKwh)
        val subtotal = energy + service + ft
        val vat = Money.round(subtotal * rates.vatRate)
        return BillBreakdown(
            rates = rates,
            totalKwh = usage.totalKwh,
            energyLines = lines,
            energyCharge = energy,
            serviceCharge = service,
            ftCharge = ft,
            subtotal = subtotal,
            vat = vat,
            total = subtotal + vat,
        )
    }

    private inline fun <reified U : Usage> requireUsage(usage: Usage, tariff: Tariff): U =
        usage as? U ?: throw IllegalArgumentException(
            "tariff ${tariff.code} needs ${U::class.simpleName} usage, got ${usage::class.simpleName}",
        )

    /**
     * Splits [kwh] across every tier of [tariff], filling each from the bottom before the
     * next. The bill's energy lines are the tiers this returns with some usage in them,
     * so the two can never disagree.
     */
    fun tierUses(tariff: TieredTariff, kwh: BigDecimal): List<TierUse> {
        require(kwh.signum() >= 0) { "usage must not be negative" }
        var lowerBound = BigDecimal.ZERO
        var remaining = kwh
        return tariff.tiers.map { tier ->
            val cap = tier.upToKwh
            val inTier = if (cap == null) remaining else minOf(remaining, cap - lowerBound)
            val use = TierUse(lowerBound, cap, tier.pricePerKwh, inTier)
            remaining -= inTier
            if (cap != null) lowerBound = cap
            use
        }
    }

    private fun tieredLines(tariff: TieredTariff, kwh: BigDecimal): List<EnergyLine> =
        tierUses(tariff, kwh)
            .filter { it.kwh.signum() > 0 }
            .map { EnergyLine(it.label, it.kwh, it.pricePerKwh) }

    private fun touLines(tariff: TouTariff, usage: Usage.TimeOfUse): List<EnergyLine> = listOf(
        EnergyLine("peak", usage.peakKwh, tariff.peakPerKwh),
        EnergyLine("off-peak", usage.offPeakKwh, tariff.offPeakPerKwh),
    )
}
