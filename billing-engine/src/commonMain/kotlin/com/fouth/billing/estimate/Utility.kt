package com.fouth.billing.estimate

/**
 * The distribution utility that bills the household.
 *
 * Thailand has two: MEA (การไฟฟ้านครหลวง) for Bangkok, Nonthaburi and Samut Prakan, and
 * PEA (การไฟฟ้าส่วนภูมิภาค) for the other 74 provinces.
 *
 * Their residential energy rates and service charges are the same baht for baht — both
 * follow the schedule the ERC sets — so the utility does not change the amount. What it
 * does change is the **type code** printed on the bill: MEA calls the two normal
 * residential rates 1.1 and 1.2, PEA calls them 1.1.1 and 1.1.2. Keeping the utility in
 * the model means the estimate can name the same rate the customer's own bill names, and
 * that a future divergence is a one-line change here rather than a redesign.
 *
 * Sources: MEA, "ประเภทที่ 1 บ้านอยู่อาศัย" (mea.or.th), and PEA's announcement of
 * 19 August 2026 revising type 1.1, effective from the September 2026 bill.
 */
enum class Utility(
    val code: String,
    /** Type code for a household at or below [HomeRates.SMALL_HOUSEHOLD_LIMIT_KWH] per month. */
    val smallHouseholdTariffCode: String,
    /** Type code for a household above that limit. */
    val largeHouseholdTariffCode: String,
) {
    MEA("MEA", "1.1", "1.2"),
    PEA("PEA", "1.1.1", "1.1.2"),
    ;

    companion object {
        /** Parses a code such as "MEA"; throws rather than guessing a default. */
        fun of(code: String): Utility =
            entries.firstOrNull { it.code.equals(code.trim(), ignoreCase = true) }
                ?: throw IllegalArgumentException("unknown utility \"$code\" (expected MEA or PEA)")
    }
}
