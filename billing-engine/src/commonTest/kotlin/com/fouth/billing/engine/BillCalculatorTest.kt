package com.fouth.billing.engine

import com.fouth.billing.engine.Fixtures.jan2025
import com.fouth.billing.engine.Fixtures.rateBook
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

// Expected amounts are worked out by hand in the comments, not computed by the engine.
class BillCalculatorTest {

    private fun bill(code: String, usage: Usage, date: LocalDate = jan2025) =
        BillCalculator.calculate(usage, rateBook.resolve(code, date))

    @Test
    fun tariff111At100KWh() {
        // 15*2.3488 + 10*2.9882 + 10*3.2405 + 65*3.6237 = 333.0595 -> 333.06
        // Ft 100*0.3972 = 39.72; subtotal 333.06+8.19+39.72 = 380.97; VAT 26.6679 -> 26.67
        val b = bill("1.1.1", Usage.Total(bd("100")))
        assertEquals(4, b.energyLines.size)
        assertEquals(bd("333.06"), b.energyCharge)
        assertEquals(bd("8.19"), b.serviceCharge)
        assertEquals(bd("39.72"), b.ftCharge)
        assertEquals(bd("380.97"), b.subtotal)
        assertEquals(bd("26.67"), b.vat)
        assertEquals(bd("407.64"), b.total)
    }

    @Test
    fun tariff112At500KWhCrossesIntoTheOpenEndedTier() {
        // 150*3.2484 + 250*4.2218 + 100*4.4217 = 487.26 + 1055.45 + 442.17 = 1984.88
        // Ft 198.60; subtotal 1984.88+24.62+198.60 = 2208.10; VAT 154.567 -> 154.57
        val b = bill("1.1.2", Usage.Total(bd("500")))
        assertEquals(listOf("0-150", "150-400", "400+"), b.energyLines.map { it.label })
        assertEquals(bd("1984.88"), b.energyCharge)
        assertEquals(bd("198.60"), b.ftCharge)
        assertEquals(bd("154.57"), b.vat)
        assertEquals(bd("2362.67"), b.total)
    }

    @Test
    fun touTariff122PricesPeakAndOffPeakSeparately() {
        // 200*5.7982 + 300*2.6369 = 1159.64 + 791.07 = 1950.71
        // Ft 500*0.3972 = 198.60; subtotal 2173.93; VAT 152.1751 -> 152.18
        val b = bill("1.2.2", Usage.TimeOfUse(bd("200"), bd("300")))
        assertEquals(bd("1950.71"), b.energyCharge)
        assertEquals(bd("24.62"), b.serviceCharge)
        assertEquals(bd("198.60"), b.ftCharge)
        assertEquals(bd("152.18"), b.vat)
        assertEquals(bd("2326.11"), b.total)
    }

    @Test
    fun tierBoundaries() {
        // kWh, energy, lines
        val cases = listOf(
            Triple("15", "35.23", 1),    // exactly the first block
            Triple("16", "38.22", 2),    // 35.232 + 2.9882
            Triple("150", "518.91", 5),  // 518.9145
            Triple("400", "1574.36", 6), // 518.9145 + 250*4.2218
            Triple("401", "1578.79", 7), // + 4.4217
        )
        for ((kwh, energy, lines) in cases) {
            val b = bill("1.1.1", Usage.Total(bd(kwh)))
            assertEquals(bd(energy), b.energyCharge, "energy at $kwh kWh")
            assertEquals(lines, b.energyLines.size, "lines at $kwh kWh")
            assertEquals(0, b.energyLines.fold(bd("0")) { s, l -> s + l.kwh }.compareTo(bd(kwh)))
        }
    }

    @Test
    fun zeroUsageStillPaysServiceChargeAndVAT() {
        val b = bill("1.1.1", Usage.Total(bd("0")))
        assertTrue(b.energyLines.isEmpty())
        assertEquals(bd("0.00"), b.energyCharge)
        assertEquals(bd("0.00"), b.ftCharge)
        assertEquals(bd("0.57"), b.vat) // 8.19 * 0.07 = 0.5733
        assertEquals(bd("8.76"), b.total)
    }

    @Test
    fun fractionalKWhFromSmartMeters() {
        // 15*2.3488 + 0.5*2.9882 = 36.7261 -> 36.73; Ft 15.5*0.3972 = 6.1566 -> 6.16
        // subtotal 36.73+8.19+6.16 = 51.08; VAT 3.5756 -> 3.58
        val b = bill("1.1.1", Usage.Total(bd("15.5")))
        assertEquals(bd("36.73"), b.energyCharge)
        assertEquals(bd("6.16"), b.ftCharge)
        assertEquals(bd("54.66"), b.total)
    }

    @Test
    fun negativeFtLowersTheBillAndVATRoundsHalfUp() {
        // Ft 500 * -0.1160 = -58.00; subtotal 1984.88+24.62-58.00 = 1951.50
        // VAT 136.605 -> 136.61 with HALF_UP (HALF_EVEN would give 136.60)
        val b = bill("1.1.2", Usage.Total(bd("500")), LocalDate(2025, 10, 15))
        assertEquals("FT-2025-3", b.rates.ftId)
        assertEquals(bd("-58.00"), b.ftCharge)
        assertEquals(bd("1951.50"), b.subtotal)
        assertEquals(bd("136.61"), b.vat)
        assertEquals(bd("2088.11"), b.total)
    }

    @Test
    fun billRecordsWhichRateVersionsItUsed() {
        val before = bill("1.1.2", Usage.Total(bd("500")), LocalDate(2025, 4, 30))
        val after = bill("1.1.2", Usage.Total(bd("500")), LocalDate(2025, 5, 1))
        assertEquals("PEA-2023-01", before.rates.tariffSetId)
        assertEquals("FT-2025-1", before.rates.ftId)
        assertEquals("FT-2025-2", after.rates.ftId)
        assertEquals("VAT-7", after.rates.vatId)
        assertEquals(bd("198.60"), before.ftCharge)
        assertEquals(bd("98.60"), after.ftCharge)
    }

    @Test
    fun usageMustMatchTheTariffKind() {
        assertFailsWith<IllegalArgumentException> { bill("1.1.1", Usage.TimeOfUse(bd("1"), bd("1"))) }
        assertFailsWith<IllegalArgumentException> { bill("1.2.2", Usage.Total(bd("1"))) }
    }

    @Test
    fun negativeUsageIsRejected() {
        assertFailsWith<IllegalArgumentException> { Usage.Total(bd("-1")) }
        assertFailsWith<IllegalArgumentException> { Usage.TimeOfUse(bd("1"), bd("-0.01")) }
    }

    @Test
    fun unknownTariffCodeOrDateWithoutRatesFails() {
        assertFailsWith<NoRateException> { rateBook.resolve("9.9.9", jan2025) }
        assertFailsWith<NoRateException> { rateBook.resolve("1.1.1", LocalDate(2024, 12, 31)) }
    }
}
