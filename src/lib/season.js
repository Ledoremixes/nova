import dayjs from 'dayjs'

export function getAcademicYearRange(date = dayjs()) {
  const currentDate = dayjs(date)

  // Settembre = 8 perché dayjs conta i mesi da 0
  const startYear = currentDate.month() >= 8
    ? currentDate.year()
    : currentDate.year() - 1

  const endYear = startYear + 1

  return {
    academicYear: `${startYear}/${endYear}`,
    startYear,
    endYear,
    fromDate: `${startYear}-09-01`,
    toDate: `${endYear}-08-31`,
    todayLimitDate: currentDate.format('YYYY-MM-DD'),
  }
}

export function getCurrentAcademicYearRange() {
  const range = getAcademicYearRange()

  return {
    ...range,

    // Per dashboard e contabilità normalmente conviene arrivare fino a oggi,
    // non fino al 31 agosto futuro.
    effectiveToDate: dayjs().isBefore(dayjs(range.toDate))
      ? dayjs().format('YYYY-MM-DD')
      : range.toDate,
  }
}