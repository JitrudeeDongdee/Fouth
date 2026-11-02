package com.fouth.billing.estimate

import com.fouth.billing.engine.decimal
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
    fun smallHouseholdUsesTariff111() {
        // 15 kWh on 1.1.1: energy 15*2.3488 = 35.232 -> 35.23; Ft 15*0.3972 = 5.958 -> 5.96
        // subtotal 35.23 + 8.19 + 5.96 = 49.38; VAT 3.4566 -> 3.46; total 52.84
        val result = HomeBillEstimator.estimate(listOf(tv), ftPerKwh = d("0.3972"))
        assertEquals("1.1.1", result.bill.rates.tariff.code)
        assertEquals(d("49.38"), result.bill.subtotal)
        assertEquals(d("52.84"), result.bill.total)
    }

    @Test
    fun householdOver150KwhUsesTariff112() {
        // 213 kWh on 1.1.2: 150*3.2484 + 63*4.2218 = 487.26 + 265.9734 = 753.2334 -> 753.23
        // Ft 213*0.3972 = 84.6036 -> 84.60; subtotal 753.23 + 24.62 + 84.60 = 862.45
        // VAT 60.3715 -> 60.37; total 922.82
        val result = HomeBillEstimator.estimate(listOf(tv, aircon, fridge), ftPerKwh = d("0.3972"))
        assertEquals("1.1.2", result.bill.rates.tariff.code)
        assertEquals(d("753.23"), result.bill.energyCharge)
        assertEquals(d("84.60"), result.bill.ftCharge)
        assertEquals(d("922.82"), result.bill.total)
    }

    @Test
    fun exactly150KwhStaysOn111() {
        assertEquals("1.1.1", HomeRates.tariffCodeFor(d("150")))
        assertEquals("1.1.2", HomeRates.tariffCodeFor(d("150.01")))
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
        val result = HomeBillEstimator.estimate(emptyList(), ftPerKwh = d("0.3972"))
        assertEquals(d("8.76"), result.bill.total)
    }
}
