package com.fouth.billing.engine

import kotlinx.datetime.LocalDate

fun bd(text: String) = decimal(text)

/**
 * Tariff rates from PEA's published residential schedule
 * (EN_Electricity_Tariffs_Jan_2023.pdf, unofficial translation).
 * Ft values are illustrative only, not official announcements.
 */
object Fixtures {
    val pea111 = TieredTariff(
        code = "1.1.1",
        tiers = listOf(
            Tier(bd("15"), bd("2.3488")),
            Tier(bd("25"), bd("2.9882")),
            Tier(bd("35"), bd("3.2405")),
            Tier(bd("100"), bd("3.6237")),
            Tier(bd("150"), bd("3.7171")),
            Tier(bd("400"), bd("4.2218")),
            Tier(null, bd("4.4217")),
        ),
        serviceCharge = bd("8.19"),
    )

    val pea112 = TieredTariff(
        code = "1.1.2",
        tiers = listOf(
            Tier(bd("150"), bd("3.2484")),
            Tier(bd("400"), bd("4.2218")),
            Tier(null, bd("4.4217")),
        ),
        serviceCharge = bd("24.62"),
    )

    val pea122 = TouTariff(
        code = "1.2.2",
        peakPerKwh = bd("5.7982"),
        offPeakPerKwh = bd("2.6369"),
        serviceCharge = bd("24.62"),
    )

    val rateBook = RateBook(
        tariffSets = EffectiveTimeline(
            listOf(Effective("PEA-2023-01", LocalDate(2023, 1, 1), null, listOf(pea111, pea112, pea122))),
        ),
        ft = EffectiveTimeline(
            listOf(
                Effective("FT-2025-1", LocalDate(2025, 1, 1), LocalDate(2025, 5, 1), bd("0.3972")),
                Effective("FT-2025-2", LocalDate(2025, 5, 1), LocalDate(2025, 9, 1), bd("0.1972")),
                Effective("FT-2025-3", LocalDate(2025, 9, 1), null, bd("-0.1160")),
            ),
        ),
        vat = EffectiveTimeline(listOf(Effective("VAT-7", LocalDate(2023, 1, 1), null, bd("0.07")))),
    )

    val jan2025: LocalDate = LocalDate(2025, 1, 31)
}
