package com.fouth.billing.engine

import java.math.BigDecimal
import java.time.LocalDate

/**
 * All rate tables, each versioned on its own timeline: base tariffs change rarely,
 * Ft changes every four months and VAT rarely.
 */
class RateBook(
    private val tariffSets: EffectiveTimeline<List<Tariff>>,
    private val ft: EffectiveTimeline<BigDecimal>,
    private val vat: EffectiveTimeline<BigDecimal>,
) {
    init {
        tariffSets.entries.forEach { set ->
            val duplicates = set.value.groupBy { it.code }.filterValues { it.size > 1 }.keys
            require(duplicates.isEmpty()) { "${set.id}: duplicate tariff codes $duplicates" }
        }
        vat.entries.forEach { require(it.value.signum() >= 0) { "${it.id}: VAT rate must not be negative" } }
    }

    fun resolve(tariffCode: String, onDate: LocalDate): ResolvedRates {
        val set = tariffSets.at(onDate)
        val tariff = set.value.firstOrNull { it.code == tariffCode }
            ?: throw NoRateException("tariff $tariffCode not in ${set.id}")
        val ftVersion = ft.at(onDate)
        val vatVersion = vat.at(onDate)
        return ResolvedRates(
            onDate = onDate,
            tariffSetId = set.id,
            tariff = tariff,
            ftId = ftVersion.id,
            ftPerKwh = ftVersion.value,
            vatId = vatVersion.id,
            vatRate = vatVersion.value,
        )
    }
}

/** The exact rate versions used for one bill. A bill stores the ids for audit. */
data class ResolvedRates(
    val onDate: LocalDate,
    val tariffSetId: String,
    val tariff: Tariff,
    val ftId: String,
    val ftPerKwh: BigDecimal,
    val vatId: String,
    val vatRate: BigDecimal,
)
