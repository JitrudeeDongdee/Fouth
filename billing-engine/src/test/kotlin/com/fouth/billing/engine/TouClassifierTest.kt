package com.fouth.billing.engine

import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource
import java.time.LocalDate
import java.time.LocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals

class TouClassifierTest {

    private val newYear = LocalDate.of(2025, 1, 1) // Wednesday
    private val classifier = TouClassifier(holidays = setOf(newYear))

    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource(
        "2025-01-06T08:45, OFF_PEAK", // Monday, before peak
        "2025-01-06T09:00, PEAK",     // peak starts inclusive
        "2025-01-06T21:45, PEAK",     // last peak interval
        "2025-01-06T22:00, OFF_PEAK", // peak end is exclusive
        "2025-01-04T12:00, OFF_PEAK", // Saturday
        "2025-01-05T12:00, OFF_PEAK", // Sunday
        "2025-01-01T12:00, OFF_PEAK", // public holiday on a weekday
    )
    fun classify(start: String, expected: TouPeriod) {
        assertEquals(expected, classifier.classify(LocalDateTime.parse(start)))
    }

    @Test
    fun `a full weekday of 15-minute readings splits 52 peak and 44 off-peak intervals`() {
        val day = LocalDate.of(2025, 1, 6).atStartOfDay()
        val readings = (0 until 96).map { IntervalReading(day.plusMinutes(15L * it), bd("0.25")) }

        val usage = classifier.summarize(readings)

        assertEquals(0, usage.peakKwh.compareTo(bd("13")))
        assertEquals(0, usage.offPeakKwh.compareTo(bd("11")))
    }

    @Test
    fun `summarized readings feed straight into a TOU bill`() {
        val day = LocalDate.of(2025, 1, 6).atStartOfDay()
        val readings = (0 until 96).map { IntervalReading(day.plusMinutes(15L * it), bd("0.25")) }

        // 13*5.7982 + 11*2.6369 = 75.3766 + 29.0059 = 104.3825 -> 104.38
        val bill = BillCalculator.calculate(
            classifier.summarize(readings),
            Fixtures.rateBook.resolve("1.2.2", Fixtures.jan2025),
        )

        assertEquals(bd("104.38"), bill.energyCharge)
    }
}
