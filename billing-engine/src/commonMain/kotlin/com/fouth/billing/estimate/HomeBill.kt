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
 * Two schedules are kept, because the rates changed: the one published in January 2023,
 * and the progressive rate the ERC approved on 5 August 2026, in force from the
 * September 2026 bill. MEA and PEA charge the same amounts under both; only the type
 * codes differ (see [Utility]).
 *
 * Ft changes every four months, so it stays an input rather than a constant.
 */
object HomeRates {
    /** Households that use at most this much per month are billed on the small-household rate. */
    val SMALL_HOUSEHOLD_LIMIT_KWH: BigDecimal = decimal("150")

    /** The January 2023 schedule starts here; nothing earlier is modelled. */
    val FIRST_SCHEDULE_FROM: LocalDate = LocalDate(2023, 1, 1)

    /** First day of the schedule now in force (the September 2026 bill). */
    val CURRENT_SCHEDULE_FROM: LocalDate = LocalDate(2026, 9, 1)

    private val smallServiceCharge = decimal("8.19")
    private val largeServiceCharge = decimal("24.62")

    private val smallTiersJan2023 = listOf(
        Tier(decimal("15"), decimal("2.3488")),
        Tier(decimal("25"), decimal("2.9882")),
        Tier(decimal("35"), decimal("3.2405")),
        Tier(decimal("100"), decimal("3.6237")),
        Tier(decimal("150"), decimal("3.7171")),
        Tier(decimal("400"), decimal("4.2218")),
        Tier(null, decimal("4.4217")),
    )

    private val largeTiersJan2023 = listOf(
        Tier(decimal("150"), decimal("3.2484")),
        Tier(decimal("400"), decimal("4.2218")),
        Tier(null, decimal("4.4217")),
    )

    // The September 2026 revision caps the first 200 units at 3 baht and takes 0.0634
    // baht off every unit from 201 up.
    private val smallTiersSep2026 = listOf(
        Tier(decimal("15"), decimal("2.3488")),
        Tier(decimal("25"), decimal("2.9882")),
        Tier(decimal("200"), decimal("3.0000")),
        Tier(decimal("400"), decimal("4.1584")),
        Tier(null, decimal("4.3583")),
    )

    private val largeTiersSep2026 = listOf(
        Tier(decimal("200"), decimal("3.0000")),
        Tier(decimal("400"), decimal("4.1584")),
        Tier(null, decimal("4.3583")),
    )

    /** The two normal residential tariffs a utility offers under one schedule. */
    private fun tariffs(utility: Utility, small: List<Tier>, large: List<Tier>) = listOf(
        TieredTariff(utility.smallHouseholdTariffCode, small, smallServiceCharge),
        TieredTariff(utility.largeHouseholdTariffCode, large, largeServiceCharge),
    )

    fun rateBook(
        utility: Utility,
        ftPerKwh: BigDecimal,
        vatRate: BigDecimal = decimal("0.07"),
    ) = RateBook(
        tariffSets = EffectiveTimeline(
            listOf(
                Effective(
                    "${utility.code}-2023-01",
                    FIRST_SCHEDULE_FROM,
                    CURRENT_SCHEDULE_FROM,
                    tariffs(utility, smallTiersJan2023, largeTiersJan2023),
                ),
                Effective(
                    "${utility.code}-2026-09",
                    CURRENT_SCHEDULE_FROM,
                    null,
                    tariffs(utility, smallTiersSep2026, largeTiersSep2026),
                ),
            ),
        ),
        ft = EffectiveTimeline(listOf(Effective("FT-INPUT", FIRST_SCHEDULE_FROM, null, ftPerKwh))),
        vat = EffectiveTimeline(listOf(Effective("VAT", FIRST_SCHEDULE_FROM, null, vatRate))),
    )

    /**
     * Picks the small- or large-household tariff from this month's usage. The utility
     * actually classifies on usage history, so this is an approximation suitable for an
     * estimate only.
     */
    fun tariffCodeFor(utility: Utility, totalKwh: BigDecimal): String =
        if (totalKwh <= SMALL_HOUSEHOLD_LIMIT_KWH) utility.smallHouseholdTariffCode
        else utility.largeHouseholdTariffCode
}

data class HomeBillEstimate(val usage: UsageEstimate, val bill: BillBreakdown)

/** Appliances in, estimated monthly electricity bill out. */
object HomeBillEstimator {
    fun estimate(
        appliances: List<Appliance>,
        utility: Utility,
        ftPerKwh: BigDecimal,
        daysPerMonth: Int = 30,
        tariffCode: String? = null,
        on: LocalDate = HomeRates.CURRENT_SCHEDULE_FROM,
    ): HomeBillEstimate {
        val usage = UsageEstimator.estimate(appliances, daysPerMonth)
        val code = tariffCode ?: HomeRates.tariffCodeFor(utility, usage.totalKwh)
        val rates = HomeRates.rateBook(utility, ftPerKwh).resolve(code, on)
        return HomeBillEstimate(usage, BillCalculator.calculate(Usage.Total(usage.totalKwh), rates))
    }
}
