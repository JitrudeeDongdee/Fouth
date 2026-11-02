package com.fouth.billing.engine

import kotlinx.datetime.LocalDate

/**
 * A value that applies from [from] (inclusive) until [until] (exclusive).
 * A null [until] means the value is still in force.
 */
data class Effective<T>(
    val id: String,
    val from: LocalDate,
    val until: LocalDate?,
    val value: T,
) {
    init {
        require(id.isNotBlank()) { "id must not be blank" }
        require(until == null || until > from) { "$id: until ($until) must be after from ($from)" }
    }

    fun covers(date: LocalDate): Boolean =
        date >= from && (until == null || date < until)
}

class NoRateException(message: String) : RuntimeException(message)

/**
 * Non-overlapping versions of a value over time. Gaps are allowed, but looking up a
 * date inside a gap fails instead of silently using a neighbouring version.
 */
class EffectiveTimeline<T>(entries: List<Effective<T>>) {
    val entries: List<Effective<T>> = entries.sortedBy { it.from }

    init {
        require(this.entries.isNotEmpty()) { "timeline must have at least one entry" }
        val duplicates = this.entries.groupBy { it.id }.filterValues { it.size > 1 }.keys
        require(duplicates.isEmpty()) { "duplicate ids: $duplicates" }
        this.entries.zipWithNext { a, b ->
            require(a.until != null && b.from >= a.until) {
                "${a.id} (${a.from}..${a.until ?: "open"}) overlaps ${b.id} (from ${b.from})"
            }
        }
    }

    fun at(date: LocalDate): Effective<T> =
        entries.lastOrNull { it.from <= date }?.takeIf { it.covers(date) }
            ?: throw NoRateException("no version in force on $date")
}
