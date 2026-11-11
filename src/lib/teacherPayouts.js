function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function amount(value) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function teacherPaymentConfig(row = {}) {
  const paymentType = row.payment_type || row.tipo_compenso || row.pagamento_tipo || row.metodo_compenso || row.compenso_tipo || 'percentuale'
  const fixed = row.fixed_monthly_compensation ?? row.compenso_fisso_mensile ?? row.compenso_default_mensile ?? row.compenso_fisso ?? row.quota_fissa_mensile ?? null
  const percent = row.percentage_compensation ?? row.percentuale_compenso ?? row.percentuale_default ?? row.percentuale_default_insegnante ?? null
  const hourly = row.hourly_rate ?? row.compenso_orario ?? row.tariffa_oraria ?? row.quota_oraria ?? null
  return { paymentType, fixed, percent, hourly }
}

function parseWeekday(value) {
  const key = lower(value)
  const map = {
    lunedi: 1, 'lunedì': 1, monday: 1,
    martedi: 2, 'martedì': 2, tuesday: 2,
    mercoledi: 3, 'mercoledì': 3, wednesday: 3,
    giovedi: 4, 'giovedì': 4, thursday: 4,
    venerdi: 5, 'venerdì': 5, friday: 5,
    sabato: 6, saturday: 6,
    domenica: 0, sunday: 0,
  }
  return map[key]
}

function parseTimeToMinutes(value) {
  const raw = text(value)
  if (!raw) return null
  const [hh, mm = '0'] = raw.split(':')
  const hours = Number(hh)
  const mins = Number(mm)
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null
  return hours * 60 + mins
}

function countWeekdayOccurrences(selectedMonth, weekday) {
  if (weekday === undefined || weekday === null) return 0
  const year = Number(String(selectedMonth).slice(0, 4))
  const monthIndex = Number(String(selectedMonth).slice(5, 7)) - 1
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return 0
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  let count = 0
  for (let day = 1; day <= lastDay; day += 1) {
    if (new Date(year, monthIndex, day).getDay() === weekday) count += 1
  }
  return count
}

function monthlyCourseHours(course = {}, selectedMonth) {
  const weekday = parseWeekday(course.giorno_settimana)
  const start = parseTimeToMinutes(course.ora_inizio)
  const end = parseTimeToMinutes(course.ora_fine)
  if (weekday === undefined || start === null || end === null || end <= start) return 0
  return countWeekdayOccurrences(selectedMonth, weekday) * ((end - start) / 60)
}

function sameTeacher(teacher, linkedTeacher) {
  if (teacher?.id && linkedTeacher?.id && String(teacher.id) === String(linkedTeacher.id)) return true
  return lower(teacher?.full_name) && lower(teacher?.full_name) === lower(linkedTeacher?.full_name)
}

function percentageForCourse(course, teacher, fallbackPercent) {
  const linked = (course?.teachers || []).find((item) => sameTeacher(teacher, item))
  const override = linked?.course_percentage_compensation
  if (override !== null && override !== undefined && override !== '') return amount(override)
  return amount(fallbackPercent)
}

function uniqueCourses(courses = []) {
  const byId = new Map()
  for (const course of Array.isArray(courses) ? courses : []) {
    const id = String(course?.id || '')
    if (!id || byId.has(id)) continue
    byId.set(id, course)
  }
  return [...byId.values()]
}

function courseSubset(courses = [], allowedIds = []) {
  const rows = uniqueCourses(courses)
  const ids = Array.isArray(allowedIds) ? allowedIds.map(String).filter(Boolean) : []
  if (!ids.length) return rows
  const allowed = new Set(ids)
  return rows.filter((course) => allowed.has(String(course.id)))
}

function monthlyTuitionPaidForRow(row = {}) {
  if (row.monthly_tuition_paid !== undefined && row.monthly_tuition_paid !== null) return amount(row.monthly_tuition_paid)
  // Compatibilità con snapshot precedenti: pagato includeva anche eventuali gettoni.
  const tuition = Math.max(0, amount(row.pagato) - amount(row.membership_fee_charged))
  return Math.max(0, tuition - amount(row.token_paid))
}

function allocateAmount({ row = {}, courses = [], value = 0, source = 'mensile', packageName = '', warning = '' } = {}) {
  const tuitionPaid = amount(value)
  const selectedCourses = uniqueCourses(courses)
  if (!selectedCourses.length || tuitionPaid <= 0) return []

  const weights = selectedCourses.map((course) => amount(course.prezzo_mensile ?? course.quota_allievo_mensile ?? course.tariffa_mensile))
  const weightsTotal = weights.reduce((sum, item) => sum + item, 0)
  const divisor = weightsTotal > 0 ? weightsTotal : selectedCourses.length

  let allocated = 0
  return selectedCourses.map((course, index) => {
    let coursePaid
    if (index === selectedCourses.length - 1) {
      coursePaid = Math.max(0, Math.round((tuitionPaid - allocated) * 100) / 100)
    } else {
      const weight = weightsTotal > 0 ? weights[index] : 1
      coursePaid = Math.round((tuitionPaid * weight / divisor) * 100) / 100
      allocated += coursePaid
    }

    return {
      payment_row_id: `${row.pagamento_id || row.id || `${row.tesseramento_id || 'student'}`}-${source}-${index}`,
      student_id: String(row.tesseramento_id || row.allievo_id || row.student_id || ''),
      student_name: row.nomeCompleto || row.nome_completo || [row.nome, row.cognome].filter(Boolean).join(' ') || 'Allievo',
      course_id: String(course.id || ''),
      course_name: course.nome || course.name || course.titolo || 'Corso',
      course_level: course.livello || '',
      paid_student_quota: coursePaid,
      source,
      package_name: packageName || '',
      allocation_warning: warning || '',
    }
  }).filter((item) => item.course_id && item.paid_student_quota > 0)
}

export const TEACHER_TOKEN_FIRST_MONTH = '2026-11'

// La prima abilitazione del Caraibico segue il nome esatto del corso,
// compreso "Caraibico bimbi". Ogni scelta esplicita admin prevale.
export function isTeacherTokenEnabled(course = {}, month = '', rules = []) {
  if (String(month) < TEACHER_TOKEN_FIRST_MONTH) return false
  const explicit = (rules || []).find((rule) => String(rule.course_id) === String(course.id))
  if (explicit) return Boolean(explicit.include_tokens) && String(month) >= String(explicit.effective_from || TEACHER_TOKEN_FIRST_MONTH)
  return /\\bcaraibic[oa]\\b/i.test(String(course.nome || course.name || ''))
}

function distributeStudentPayment(row = {}, { month = '', tokenRules = [] } = {}) {
  const allCourses = uniqueCourses(row.corsi)
  if (!allCourses.length) return []

  const rows = []
  const monthlyPaid = monthlyTuitionPaidForRow(row)
  if (monthlyPaid > 0) {
    const monthlyCourses = courseSubset(allCourses, row.teacher_allocation_course_ids)
    const warning = Array.isArray(row.teacher_allocation_course_ids)
      && row.teacher_allocation_course_ids.length > 0
      && monthlyCourses.length === 0
      ? `Pacchetto ${row.teacher_allocation_package_name || 'mensile'} associato a corsi non presenti tra le iscrizioni attive.`
      : ''
    rows.push(...allocateAmount({
      row,
      courses: monthlyCourses.length ? monthlyCourses : allCourses,
      value: monthlyPaid,
      source: 'mensile',
      packageName: row.teacher_allocation_package_name || row.nova_package_name || row.tipo_pacchetto || '',
      warning,
    }))
  }

  // Per evitare errori di attribuzione: se un gettone non ha il corso
  // esplicito e l'allievo segue più corsi, non si può scegliere un corso
  // presunto. Se il pacchetto copre più corsi, ripartiamo sull'INTERA
  // selezione e poi includiamo soltanto quelli abilitati dal pannello admin.
  const distributeToken = (token, index, legacy = false) => {
    const tokenAmount = amount(token.amount)
    if (tokenAmount <= 0) return

    const ids = Array.isArray(token.course_ids) ? token.course_ids.map(String).filter(Boolean) : []
    const targetCourses = ids.length
      ? courseSubset(allCourses, ids)
      : (allCourses.length === 1 ? allCourses : [])

    if (!targetCourses.length) return
    const warning = targetCourses.length > 1
      ? `Gettone ${token.packageName || ''} multi-corso: incasso ripartito tra tutti i corsi e remunerato solo per i corsi abilitati.`
      : ''

    const allocated = allocateAmount({
      row: { ...row, pagamento_id: token.id || row.pagamento_id },
      courses: targetCourses,
      value: tokenAmount,
      source: legacy ? 'gettone-legacy' : `gettone-${index + 1}`,
      packageName: token.packageName || 'A gettone',
      warning,
    })
    for (const item of allocated) {
      const course = targetCourses.find((candidate) => String(candidate.id) === String(item.course_id))
      if (course && isTeacherTokenEnabled(course, month, tokenRules)) rows.push(item)
    }
  }

  const tokenRows = Array.isArray(row.token_breakdown) ? row.token_breakdown : []
  if (tokenRows.length) {
    tokenRows.forEach((token, index) => distributeToken(token || {}, index))
  } else if (amount(row.token_paid) > 0) {
    // Dato legacy: nessuna doppia remunerazione con token_breakdown.
    distributeToken({ amount: row.token_paid, packageName: 'Gettone legacy' }, 0, true)
  }

  return rows
}

/**
 * Calcola i compensi insegnanti usando le stesse righe normalizzate dalla
 * sezione Pagamenti. La percentuale specifica del corso ha sempre precedenza
 * sulla percentuale generale dell'insegnante.
 *
 * Per i pacchetti multicorso il compenso viene calcolato sulla parte di incasso
 * effettivamente attribuita a ciascun corso. Tessera associativa e omaggi non
 * generano compenso; sconti e pagamenti parziali riducono proporzionalmente la
 * base di calcolo perché rappresentano l'incasso reale.
 */
export function buildTeacherMonthlyPayouts({ teachers = [], courses = [], paymentRows = [], month = '', tokenRules = [] } = {}) {
  const selectedMonth = month || new Date().toISOString().slice(0, 7)
  const paidCourseRows = paymentRows.flatMap((row) => distributeStudentPayment(row, { month: selectedMonth, tokenRules }))

  const payouts = (teachers || []).map((teacher) => {
    const config = teacherPaymentConfig(teacher)
    const assignedCourses = (courses || []).filter((course) => (course.teachers || []).some((linkedTeacher) => sameTeacher(teacher, linkedTeacher)))
    const assignedCourseIds = new Set(assignedCourses.map((course) => String(course.id)))
    const rows = paidCourseRows.filter((row) => assignedCourseIds.has(String(row.course_id)))
    const paidTotal = rows.reduce((sum, row) => sum + row.paid_student_quota, 0)
    const studentsCount = new Set(rows.map((row) => row.student_id).filter(Boolean)).size
    const paidCourseIds = new Set(rows.map((row) => String(row.course_id)))
    const warnings = [...new Set(rows.map((row) => row.allocation_warning).filter(Boolean))]

    let total = 0
    let detailRows = []

    if (lower(config.paymentType).includes('orar')) {
      detailRows = assignedCourses
        .filter((course) => paidCourseIds.has(String(course.id)))
        .map((course) => {
          const hours = monthlyCourseHours(course, selectedMonth)
          const rate = amount(config.hourly)
          const teacherQuota = hours * rate
          total += teacherQuota
          return {
            enrollment_id: `${teacher.id}-${course.id}-${selectedMonth}`,
            course_name: course.nome || 'Corso',
            course_level: course.livello || '',
            student_name: `${hours.toFixed(2)} ore nel mese`,
            student_quota: 0,
            teacher_quota: teacherQuota,
            percentuale_insegnante: null,
            method: `${rate.toFixed(2)} €/h`,
            source: 'orario',
          }
        })
    } else if (lower(config.paymentType).includes('fiss')) {
      total = rows.length > 0 ? amount(config.fixed) : 0
      detailRows = total > 0 ? [{
        enrollment_id: `${teacher.id}-${selectedMonth}`,
        course_name: 'Compenso mensile fisso',
        course_level: '',
        student_name: `${studentsCount} allievi paganti`,
        student_quota: paidTotal,
        teacher_quota: total,
        percentuale_insegnante: null,
        method: 'quota fissa mensile',
        source: 'fisso',
      }] : []
    } else {
      const fallbackPercent = amount(config.percent)
      const assignedCourseById = new Map(assignedCourses.map((course) => [String(course.id), course]))
      detailRows = rows.map((row) => {
        const course = assignedCourseById.get(String(row.course_id))
        const percent = percentageForCourse(course, teacher, fallbackPercent)
        const teacherQuota = row.paid_student_quota * percent / 100
        total += teacherQuota
        return {
          enrollment_id: `${teacher.id}-${row.payment_row_id}-${row.course_id}`,
          course_name: row.course_name,
          course_level: row.course_level,
          student_name: row.student_name,
          student_quota: row.paid_student_quota,
          teacher_quota: teacherQuota,
          percentuale_insegnante: percent,
          method: `${percent}% su quota pagata`,
          source: row.source || 'mensile',
          package_name: row.package_name || '',
          allocation_warning: row.allocation_warning || '',
        }
      })
    }

    return {
      teacher_id: teacher.id,
      key: lower(teacher.full_name) || String(teacher.id),
      teacher_name: teacher.full_name,
      month: selectedMonth,
      total: Math.round(total * 100) / 100,
      attributed_tuition: Math.round(paidTotal * 100) / 100,
      students_count: studentsCount,
      courses_count: assignedCourses.length,
      rows: detailRows,
      warnings,
    }
  })

  return payouts.sort((a, b) => b.total - a.total)
}
