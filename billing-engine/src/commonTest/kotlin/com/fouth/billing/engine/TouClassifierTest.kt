package com.fouth.billing.engine

import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlin.test.Test
import kotlin.test.assertEquals

class TouClassifierTest {

    private val newYear = LocalDate(2025, 1, 1) // Wednesday
    private val classifier = TouClassifier(holidays = setOf(newYear))

    @Test
    fun classify() {
        val cases = listOf(
            "2025-01-06T08:45" to TouPeriod.OFF_PEAK, // Monday, before peak
            "2025-01-06T09:00" to TouPeriod.PEAK,     // peak starts inclusive
            "2025-01-06T21:45" to TouPeriod.PEAK,     // last peak interval
            "2025-01-06T22:00" to TouPeriod.OFF_PEAK, // peak end is exclusive
            "2025-01-04T12:00" to TouPeriod.OFF_PEAK, // Saturday
            "2025-01-05T12:00" to TouPeriod.OFF_PEAK, // Sunday
            "2025-01-01T12:00" to TouPeriod.OFF_PEAK, // public holiday on a weekday
        )
        for ((start, expected) in cases) {
            assertEquals(expected, classifier.classify(LocalDateTime.parse(start)), start)
        }
    }

    /** 96 readings of 0.25 kWh, one per 15 minutes, starting at midnight on [date]. */
    private fun fullDay(date: LocalDate) =
        (0 until 96).map { IntervalReading(LocalDateTime(date, LocalTime(it / 4, it % 4 * 15)), bd("0.25")) }

    @Test
    fun aFullWeekdayOf15MinuteReadingsSplits52PeakAnd44OffPeakIntervals() {
        val readings = fullDay(LocalDate(2025, 1, 6))

        val usage = classifier.summarize(readings)

        assertEquals(0, usage.peakKwh.compareTo(bd("13")))
        assertEquals(0, usage.offPeakKwh.compareTo(bd("11")))
    }

    @Test
    fun summarizedReadingsFeedStraightIntoATOUBill() {
        val readings = fullDay(LocalDate(2025, 1, 6))

        // 13*5.7982 + 11*2.6369 = 75.3766 + 29.0059 = 104.3825 -> 104.38
        val bill = BillCalculator.calculate(
            classifier.summarize(readings),
            Fixtures.rateBook.resolve("1.2.2", Fixtures.jan2025),
        )

        assertEquals(bd("104.38"), bill.energyCharge)
    }
}
