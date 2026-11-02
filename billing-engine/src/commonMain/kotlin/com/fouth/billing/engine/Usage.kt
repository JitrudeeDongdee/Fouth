package com.fouth.billing.engine

import com.ionspin.kotlin.bignum.decimal.BigDecimal

sealed interface Usage {
    val totalKwh: BigDecimal

    /** Consumption for a tiered tariff. */
    data class Total(val kwh: BigDecimal) : Usage {
        init {
            require(kwh.signum() >= 0) { "kWh must not be negative: $kwh" }
        }

        override val totalKwh: BigDecimal get() = kwh
    }

    /** Consumption split by time of use, for a TOU tariff. */
    data class TimeOfUse(val peakKwh: BigDecimal, val offPeakKwh: BigDecimal) : Usage {
        init {
            require(peakKwh.signum() >= 0 && offPeakKwh.signum() >= 0) {
                "kWh must not be negative: peak=$peakKwh, offPeak=$offPeakKwh"
            }
        }

        override val totalKwh: BigDecimal get() = peakKwh + offPeakKwh
    }
}
