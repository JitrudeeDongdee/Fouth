package com.fouth.billing.engine

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.minus
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class RatesAndRoundingTest {

    private val jan1 = LocalDate(2025, 1, 1)
    private val may1 = LocalDate(2025, 5, 1)
    private val sep1 = LocalDate(2025, 9, 1)

    @Test
    fun moneyRoundsHalfUpToTwoPlaces() {
        assertEquals(bd("0.11"), Money.round(bd("0.105")))
        assertEquals(bd("0.10"), Money.round(bd("0.104999")))
        assertEquals(bd("-0.11"), Money.round(bd("-0.105")))
        assertEquals(bd("8.19"), Money.of("8.19"))
    }

    @Test
    fun timelinePicksTheVersionInForceUntilIsExclusive() {
        val t = EffectiveTimeline(
            listOf(Effective("b", may1, null, "B"), Effective("a", jan1, may1, "A")),
        )
        assertEquals("a", t.at(jan1).id)
        assertEquals("a", t.at(may1.minus(1, DateTimeUnit.DAY)).id)
        assertEquals("b", t.at(may1).id)
        assertEquals("b", t.at(LocalDate(2099, 1, 1)).id)
    }

    @Test
    fun timelineLookupInAGapOrBeforeTheFirstVersionFails() {
        val t = EffectiveTimeline(
            listOf(Effective("a", jan1, may1, 1), Effective("c", sep1, null, 3)),
        )
        assertFailsWith<NoRateException> { t.at(LocalDate(2025, 6, 1)) }
        assertFailsWith<NoRateException> { t.at(LocalDate(2024, 12, 31)) }
    }

    @Test
    fun timelineRejectsOverlapsAndDuplicateIds() {
        assertFailsWith<IllegalArgumentException> {
            EffectiveTimeline(listOf(Effective("a", jan1, sep1, 1), Effective("b", may1, null, 2)))
        }
        assertFailsWith<IllegalArgumentException> {
            EffectiveTimeline(listOf(Effective("a", jan1, null, 1), Effective("b", may1, null, 2)))
        }
        assertFailsWith<IllegalArgumentException> {
            EffectiveTimeline(listOf(Effective("a", jan1, may1, 1), Effective("a", may1, null, 2)))
        }
        assertFailsWith<IllegalArgumentException> { Effective("a", may1, jan1, 1) }
    }

    @Test
    fun tieredTariffValidatesItsTiers() {
        assertFailsWith<IllegalArgumentException> {
            TieredTariff("x", listOf(Tier(bd("10"), bd("1"))), bd("0"))
        }
        assertFailsWith<IllegalArgumentException> {
            TieredTariff("x", listOf(Tier(bd("10"), bd("1")), Tier(bd("10"), bd("2")), Tier(null, bd("3"))), bd("0"))
        }
        assertFailsWith<IllegalArgumentException> {
            TieredTariff("x", listOf(Tier(null, bd("1")), Tier(null, bd("2"))), bd("0"))
        }
        assertFailsWith<IllegalArgumentException> {
            TieredTariff("x", listOf(Tier(null, bd("-1"))), bd("0"))
        }
    }

    @Test
    fun rateBookRejectsDuplicateTariffCodesInOneSet() {
        assertFailsWith<IllegalArgumentException> {
            RateBook(
                EffectiveTimeline(listOf(Effective("s", jan1, null, listOf<Tariff>(Fixtures.pea111, Fixtures.pea111)))),
                EffectiveTimeline(listOf(Effective("ft", jan1, null, bd("0")))),
                EffectiveTimeline(listOf(Effective("vat", jan1, null, bd("0.07")))),
            )
        }
    }
}
