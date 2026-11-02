package com.fouth.billing.engine

import java.math.BigDecimal

/** One priced block of energy. [amount] is exact; rounding happens on the bill total. */
data class EnergyLine(
    val label: String,
    val kwh: BigDecimal,
    val pricePerKwh: BigDecimal,
) {
    val amount: BigDecimal get() = kwh * pricePerKwh
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

    private fun tieredLines(tariff: TieredTariff, kwh: BigDecimal): List<EnergyLine> {
        val lines = mutableListOf<EnergyLine>()
        var lowerBound = BigDecimal.ZERO
        var remaining = kwh
        for (tier in tariff.tiers) {
            if (remaining.signum() == 0) break
            val cap = tier.upToKwh
            val inTier = if (cap == null) remaining else remaining.min(cap - lowerBound)
            val label = if (cap == null) "${lowerBound.toPlainString()}+" else "${lowerBound.toPlainString()}-${cap.toPlainString()}"
            lines += EnergyLine(label, inTier, tier.pricePerKwh)
            remaining -= inTier
            if (cap != null) lowerBound = cap
        }
        return lines
    }

    private fun touLines(tariff: TouTariff, usage: Usage.TimeOfUse): List<EnergyLine> = listOf(
        EnergyLine("peak", usage.peakKwh, tariff.peakPerKwh),
        EnergyLine("off-peak", usage.offPeakKwh, tariff.offPeakPerKwh),
    )
}
