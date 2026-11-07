@file:OptIn(ExperimentalJsExport::class)

package com.fouth.billing.web

import com.fouth.billing.engine.Money
import com.fouth.billing.engine.decimal
import com.fouth.billing.estimate.AirConditioner
import com.fouth.billing.estimate.Appliance
import com.fouth.billing.estimate.HomeBillEstimator
import com.fouth.billing.estimate.HomeRates
import com.fouth.billing.estimate.LabelledAppliance
import com.fouth.billing.estimate.RatedAppliance
import com.fouth.billing.estimate.Utility
import com.ionspin.kotlin.bignum.decimal.DecimalMode
import com.ionspin.kotlin.bignum.decimal.RoundingMode

/*
 * The boundary the browser page talks to. Numbers cross it as strings, exactly as the
 * user typed them, so no value is ever turned into a floating-point number on the way.
 */

/**
 * One row of the form. [kind] is "rated" (watts + hours), "aircon" (BTU + EER + hours +
 * load %) or "label" (kWh/year from the energy label). Fields a kind does not use are ignored.
 */
@JsExport
class ApplianceInput(
    val kind: String,
    val name: String,
    val quantity: String,
    val watts: String,
    val hoursPerDay: String,
    val btu: String,
    val eer: String,
    val loadPercent: String,
    val kwhPerYear: String,
)

@JsExport
class ApplianceLine(val name: String, val kwhPerMonth: String, val bahtShare: String)

@JsExport
class BillLine(val label: String, val kwh: String, val pricePerKwh: String, val amount: String)

@JsExport
class EstimateResult(
    /** Empty when the estimate succeeded; otherwise the reason the input was rejected. */
    val error: String,
    val appliances: Array<ApplianceLine>,
    val totalKwh: String,
    val tariffCode: String,
    val energyLines: Array<BillLine>,
    val energyCharge: String,
    val serviceCharge: String,
    val ftCharge: String,
    val subtotal: String,
    val vat: String,
    val total: String,
)

/**
 * [utility] is "MEA" or "PEA". The two charge the same amounts; the utility decides
 * which type code the estimate reports (MEA 1.1 / 1.2, PEA 1.1.1 / 1.1.2).
 */
@JsExport
fun estimateBill(
    inputs: Array<ApplianceInput>,
    utility: String,
    ftPerKwh: String,
    daysPerMonth: Int,
): EstimateResult =
    try {
        val appliances = inputs.map(::toAppliance)
        val result = HomeBillEstimator.estimate(appliances, Utility.of(utility), decimal(ftPerKwh), daysPerMonth)
        val bill = result.bill
        // Rough split of the bill by each appliance's share of the kWh, for display only.
        val totalKwh = result.usage.totalKwh
        EstimateResult(
            error = "",
            appliances = result.usage.appliances.map { line ->
                val share = if (totalKwh.signum() == 0) totalKwh else (line.kwhPerMonth * bill.total).divide(totalKwh, SHARE_DIVISION)
                ApplianceLine(line.appliance.name, Money.format(line.kwhPerMonth), Money.format(share))
            }.toTypedArray(),
            totalKwh = Money.format(totalKwh),
            tariffCode = bill.rates.tariff.code,
            energyLines = bill.energyLines.map {
                BillLine(it.label, it.kwh.toStringExpanded(), it.pricePerKwh.toStringExpanded(), Money.format(it.amount))
            }.toTypedArray(),
            energyCharge = Money.format(bill.energyCharge),
            serviceCharge = Money.format(bill.serviceCharge),
            ftCharge = Money.format(bill.ftCharge),
            subtotal = Money.format(bill.subtotal),
            vat = Money.format(bill.vat),
            total = Money.format(bill.total),
        )
    } catch (e: Exception) {
        EstimateResult(e.message ?: "invalid input", emptyArray(), "", "", emptyArray(), "", "", "", "", "", "")
    }

/** kWh per month at which the estimate switches from the small- to the large-household tariff. */
@JsExport
fun smallHouseholdLimitKwh(): String = HomeRates.SMALL_HOUSEHOLD_LIMIT_KWH.toStringExpanded()

/** One utility's code and the two type codes it prints on a residential bill. */
@JsExport
class UtilityTariffs(val code: String, val smallHousehold: String, val largeHousehold: String)

/**
 * The utilities the page may pass to [estimateBill], with their type codes, so the page
 * never has to repeat them and the two cannot drift apart.
 */
@JsExport
fun utilities(): Array<UtilityTariffs> =
    Utility.entries.map { UtilityTariffs(it.code, it.smallHouseholdTariffCode, it.largeHouseholdTariffCode) }
        .toTypedArray()

/** A share of the bill is display-only; four decimals is plenty before it is rounded to satang. */
private val SHARE_DIVISION = DecimalMode(decimalPrecision = 30, roundingMode = RoundingMode.ROUND_HALF_AWAY_FROM_ZERO, scale = 4)

private fun toAppliance(input: ApplianceInput): Appliance {
    val name = input.name.ifBlank { "Appliance" }
    val quantity = input.quantity.trim().toIntOrNull() ?: throw IllegalArgumentException("$name: quantity must be a whole number")
    return when (input.kind) {
        "rated" -> RatedAppliance(name, number(name, input.watts), number(name, input.hoursPerDay), quantity)
        "aircon" -> AirConditioner(
            name = name,
            btuPerHour = number(name, input.btu),
            eer = number(name, input.eer),
            hoursPerDay = number(name, input.hoursPerDay),
            loadFactor = number(name, input.loadPercent) / decimal("100"),
            quantity = quantity,
        )
        "label" -> LabelledAppliance(name, number(name, input.kwhPerYear), quantity)
        else -> throw IllegalArgumentException("$name: unknown appliance kind ${input.kind}")
    }
}

private fun number(name: String, text: String) =
    try {
        decimal(text)
    } catch (e: Exception) {
        throw IllegalArgumentException("$name: \"$text\" is not a number")
    }
