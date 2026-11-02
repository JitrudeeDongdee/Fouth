package com.fouth.billing.estimate

import com.fouth.billing.engine.BillBreakdown
import com.fouth.billing.engine.BillCalculator
import com.fouth.billing.engine.Effective
import com.fouth.billing.engine.EffectiveTimeline
import com.fouth.billing.engine.RateBook
import com.fouth.billing.engine.Tier
import com.fouth.billing.engine.TieredTariff
import com.fouth.billing.engine.Usage
import com.fouth.billing.engine.decimal
import com.ionspin.kotlin.bignum.decimal.BigDecimal
import kotlinx.datetime.LocalDate

/**
 * Residential rates used by the public estimator.
 *
 * Tariff rates are PEA's published residential schedule (Jan 2023, unofficial English
 * translation). Ft changes every four months, so it is an input rather than a constant.
 */
object HomeRates {
    /** Households that use at most this much per month are billed on 1.1.1, others on 1.1.2. */
    val SMALL_HOUSEHOLD_LIMIT_KWH: BigDecimal = decimal("150")

    val pea111 = TieredTariff(
        code = "1.1.1",
        tiers = listOf(
            Tier(decimal("15"), decimal("2.3488")),
            Tier(decimal("25"), decimal("2.9882")),
            Tier(decimal("35"), decimal("3.2405")),
            Tier(decimal("100"), decimal("3.6237")),
            Tier(decimal("150"), decimal("3.7171")),
            Tier(decimal("400"), decimal("4.2218")),
            Tier(null, decimal("4.4217")),
        ),
        serviceCharge = decimal("8.19"),
    )

    val pea112 = TieredTariff(
        code = "1.1.2",
        tiers = listOf(
            Tier(decimal("150"), decimal("3.2484")),
            Tier(decimal("400"), decimal("4.2218")),
            Tier(null, decimal("4.4217")),
        ),
        serviceCharge = decimal("24.62"),
    )

    private val since = LocalDate(2023, 1, 1)

    fun rateBook(ftPerKwh: BigDecimal, vatRate: BigDecimal = decimal("0.07")) = RateBook(
        tariffSets = EffectiveTimeline(listOf(Effective("PEA-2023-01", since, null, listOf(pea111, pea112)))),
        ft = EffectiveTimeline(listOf(Effective("FT-INPUT", since, null, ftPerKwh))),
        vat = EffectiveTimeline(listOf(Effective("VAT", since, null, vatRate))),
    )

    /**
     * Picks 1.1.1 or 1.1.2 from this month's usage. The utility actually classifies on
     * usage history, so this is an approximation suitable for an estimate only.
     */
    fun tariffCodeFor(totalKwh: BigDecimal): String =
        if (totalKwh <= SMALL_HOUSEHOLD_LIMIT_KWH) pea111.code else pea112.code
}

data class HomeBillEstimate(val usage: UsageEstimate, val bill: BillBreakdown)

/** Appliances in, estimated monthly electricity bill out. */
object HomeBillEstimator {
    fun estimate(
        appliances: List<Appliance>,
        ftPerKwh: BigDecimal,
        daysPerMonth: Int = 30,
        tariffCode: String? = null,
    ): HomeBillEstimate {
        val usage = UsageEstimator.estimate(appliances, daysPerMonth)
        val code = tariffCode ?: HomeRates.tariffCodeFor(usage.totalKwh)
        val rates = HomeRates.rateBook(ftPerKwh).resolve(code, LocalDate(2025, 1, 1))
        return HomeBillEstimate(usage, BillCalculator.calculate(Usage.Total(usage.totalKwh), rates))
    }
}
