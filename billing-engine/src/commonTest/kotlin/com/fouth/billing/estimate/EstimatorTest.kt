package com.fouth.billing.estimate

import com.fouth.billing.engine.decimal
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

// Expected figures are worked out by hand in the comments, not computed by the code.
class EstimatorTest {

    private fun d(text: String) = decimal(text)

    private val tv = RatedAppliance("TV", d("100"), d("5"))
    private val aircon = AirConditioner("Bedroom AC", btuPerHour = d("12000"), eer = d("12"), hoursPerDay = d("8"))
    private val fridge = LabelledAppliance("Fridge", kwhPerYear = d("365"))

    @Test
    fun ratedApplianceIsWattsTimesHours() {
        // 100 W * 5 h = 0.5 kWh/day * 30 = 15 kWh
        assertEquals(d("15"), UsageEstimator.estimate(listOf(tv)).totalKwh)
    }

    @Test
    fun airConditionerUsesBtuOverEerAndLoadFactor() {
        // 12000 / 12 = 1000 W; * 0.7 * 8 h = 5.6 kWh/day * 30 = 168 kWh
        assertEquals(d("1000"), aircon.watts)
        assertEquals(d("168"), UsageEstimator.estimate(listOf(aircon)).totalKwh)
    }

    @Test
    fun loadFactorIsAnAdjustableAssumption() {
        // full load: 1000 W * 8 h * 30 = 240 kWh
        val flatOut = aircon.copy(loadFactor = d("1"))
        assertEquals(d("240"), UsageEstimator.estimate(listOf(flatOut)).totalKwh)
    }

    @Test
    fun labelledApplianceSpreadsYearlyEnergyOverDays() {
        // 365 kWh/year = 1 kWh/day * 30 = 30 kWh
        assertEquals(d("30"), UsageEstimator.estimate(listOf(fridge)).totalKwh)
        // 100 / 365 * 30 = 8.2191... -> 8.22
        assertEquals(d("8.22"), UsageEstimator.estimate(listOf(LabelledAppliance("Small fridge", d("100")))).totalKwh)
    }

    @Test
    fun quantityAndDaysMultiply() {
        // 2 fans * 50 W * 10 h = 1 kWh/day * 31 days = 31 kWh
        val fans = RatedAppliance("Fan", d("50"), d("10"), quantity = 2)
        assertEquals(d("31"), UsageEstimator.estimate(listOf(fans), daysPerMonth = 31).totalKwh)
    }

    @Test
    fun totalIsTheSumOfRoundedLines() {
        val estimate = UsageEstimator.estimate(listOf(tv, aircon, fridge))
        assertEquals(listOf(d("15"), d("168"), d("30")), estimate.appliances.map { it.kwhPerMonth })
        assertEquals(d("213"), estimate.totalKwh)
    }

    @Test
    fun smallHouseholdUsesTheSmallTariff() {
        // 15 kWh on PEA 1.1.1: energy 15*2.3488 = 35.232 -> 35.23; Ft 15*0.3972 = 5.958 -> 5.96
        // subtotal 35.23 + 8.19 + 5.96 = 49.38; VAT 3.4566 -> 3.46; total 52.84
        val result = HomeBillEstimator.estimate(listOf(tv), Utility.PEA, ftPerKwh = d("0.3972"))
        assertEquals("1.1.1", result.bill.rates.tariff.code)
        assertEquals(d("49.38"), result.bill.subtotal)
        assertEquals(d("52.84"), result.bill.total)
    }

    @Test
    fun householdOver150KwhUsesTheLargeTariff() {
        // 213 kWh on the Sep 2026 large tariff: 200*3.0000 + 13*4.1584
        //   = 600 + 54.0592 = 654.0592 -> 654.06
        // Ft 213*0.3972 = 84.6036 -> 84.60; subtotal 654.06 + 24.62 + 84.60 = 763.28
        // VAT 53.4296 -> 53.43; total 816.71
        val result = HomeBillEstimator.estimate(listOf(tv, aircon, fridge), Utility.PEA, ftPerKwh = d("0.3972"))
        assertEquals("1.1.2", result.bill.rates.tariff.code)
        assertEquals(d("654.06"), result.bill.energyCharge)
        assertEquals(d("84.60"), result.bill.ftCharge)
        assertEquals(d("816.71"), result.bill.total)
    }

    @Test
    fun exactly150KwhStaysOnTheSmallTariff() {
        assertEquals("1.1.1", HomeRates.tariffCodeFor(Utility.PEA, d("150")))
        assertEquals("1.1.2", HomeRates.tariffCodeFor(Utility.PEA, d("150.01")))
        assertEquals("1.1", HomeRates.tariffCodeFor(Utility.MEA, d("150")))
        assertEquals("1.2", HomeRates.tariffCodeFor(Utility.MEA, d("150.01")))
    }

    @Test
    fun meaAndPeaChargeTheSameAmountAndDifferOnlyInTheTypeCode() {
        val appliances = listOf(tv, aircon, fridge)
        val mea = HomeBillEstimator.estimate(appliances, Utility.MEA, ftPerKwh = d("0.3972"))
        val pea = HomeBillEstimator.estimate(appliances, Utility.PEA, ftPerKwh = d("0.3972"))

        assertEquals("1.2", mea.bill.rates.tariff.code)
        assertEquals("1.1.2", pea.bill.rates.tariff.code)
        assertEquals(pea.bill.energyCharge, mea.bill.energyCharge)
        assertEquals(pea.bill.serviceCharge, mea.bill.serviceCharge)
        assertEquals(pea.bill.total, mea.bill.total)
    }

    @Test
    fun theJanuary2023ScheduleIsStillPricedForDatesBeforeSeptember2026() {
        // Same 213 kWh on the old large tariff: 150*3.2484 + 63*4.2218
        //   = 487.26 + 265.9734 = 753.2334 -> 753.23
        // subtotal 753.23 + 24.62 + 84.60 = 862.45; VAT 60.3715 -> 60.37; total 922.82
        val result = HomeBillEstimator.estimate(
            listOf(tv, aircon, fridge),
            Utility.PEA,
            ftPerKwh = d("0.3972"),
            on = LocalDate(2025, 1, 1),
        )
        assertEquals(d("753.23"), result.bill.energyCharge)
        assertEquals(d("922.82"), result.bill.total)
    }

    @Test
    fun theFirst200UnitsAreCappedAtThreeBaht() {
        // 200 kWh on the small tariff: 15*2.3488 + 10*2.9882 + 175*3.0000
        //   = 35.232 + 29.882 + 525 = 590.114 -> 590.11
        val heater = RatedAppliance("Heater", watts = d("10000"), hoursPerDay = d("1")) // 10 kWh/day
        val result = HomeBillEstimator.estimate(
            listOf(heater),
            Utility.PEA,
            ftPerKwh = d("0"),
            daysPerMonth = 20,
            tariffCode = "1.1.1",
        )
        assertEquals(d("200"), result.usage.totalKwh)
        assertEquals(d("590.11"), result.bill.energyCharge)
    }

    @Test
    fun anUnknownUtilityIsRejected() {
        assertEquals(Utility.MEA, Utility.of("mea"))
        assertEquals(Utility.PEA, Utility.of(" PEA "))
        assertFailsWith<IllegalArgumentException> { Utility.of("EGAT") }
    }

    @Test
    fun invalidSpecsAreRejected() {
        assertFailsWith<IllegalArgumentException> { RatedAppliance("x", d("100"), d("25")) }
        assertFailsWith<IllegalArgumentException> { RatedAppliance("x", d("-1"), d("1")) }
        assertFailsWith<IllegalArgumentException> { RatedAppliance("x", d("1"), d("1"), quantity = 0) }
        assertFailsWith<IllegalArgumentException> { AirConditioner("x", d("12000"), d("0"), d("8")) }
        assertFailsWith<IllegalArgumentException> { AirConditioner("x", d("12000"), d("12"), d("8"), loadFactor = d("1.5")) }
        assertFailsWith<IllegalArgumentException> { LabelledAppliance("x", d("-5")) }
        assertFailsWith<IllegalArgumentException> { UsageEstimator.estimate(listOf(tv), daysPerMonth = 0) }
    }

    @Test
    fun noAppliancesStillPaysServiceCharge() {
        // 0 kWh on 1.1.1: 8.19 + VAT 0.5733 -> 0.57 = 8.76
        val result = HomeBillEstimator.estimate(emptyList(), Utility.PEA, ftPerKwh = d("0.3972"))
        assertEquals(d("8.76"), result.bill.total)
    }
}
