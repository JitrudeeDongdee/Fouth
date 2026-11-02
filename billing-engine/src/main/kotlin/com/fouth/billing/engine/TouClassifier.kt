package com.fouth.billing.engine

import java.math.BigDecimal
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

enum class TouPeriod { PEAK, OFF_PEAK }

/** One smart-meter interval (normally 15 minutes), in local time. */
data class IntervalReading(val start: LocalDateTime, val kwh: BigDecimal)

/**
 * Splits interval readings into peak and off-peak.
 *
 * Peak is weekdays from [peakStart] (inclusive) to [peakEnd] (exclusive); weekends and
 * [holidays] are off-peak all day. An interval is classified by its start time.
 */
class TouClassifier(
    private val holidays: Set<LocalDate>,
    private val peakStart: LocalTime = LocalTime.of(9, 0),
    private val peakEnd: LocalTime = LocalTime.of(22, 0),
) {
    init {
        require(peakEnd.isAfter(peakStart)) { "peakEnd must be after peakStart" }
    }

    fun classify(intervalStart: LocalDateTime): TouPeriod {
        val date = intervalStart.toLocalDate()
        val weekend = date.dayOfWeek == DayOfWeek.SATURDAY || date.dayOfWeek == DayOfWeek.SUNDAY
        if (weekend || date in holidays) return TouPeriod.OFF_PEAK
        val time = intervalStart.toLocalTime()
        return if (!time.isBefore(peakStart) && time.isBefore(peakEnd)) TouPeriod.PEAK else TouPeriod.OFF_PEAK
    }

    fun summarize(readings: Iterable<IntervalReading>): Usage.TimeOfUse {
        var peak = BigDecimal.ZERO
        var offPeak = BigDecimal.ZERO
        for (reading in readings) {
            require(reading.kwh.signum() >= 0) { "negative reading at ${reading.start}" }
            when (classify(reading.start)) {
                TouPeriod.PEAK -> peak += reading.kwh
                TouPeriod.OFF_PEAK -> offPeak += reading.kwh
            }
        }
        return Usage.TimeOfUse(peak, offPeak)
    }
}
