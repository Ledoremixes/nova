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

function tuitionPaidForRow(row = {}) {
  // La pagina Pagamenti include nell'importo visualizzato anche l'eventuale tessera
  // corsista addebitata nel mese. Il compenso insegnante deve invece considerare
  // esclusivamente le quote corsi.
  return Math.max(0, amount(row.pagato) - amount(row.membership_fee_charged))
}

function distributeStudentPayment(row = {}) {
  const courses = Array.isArray(row.corsi) ? row.corsi : []
  const tuitionPaid = tuitionPaidForRow(row)
  if (!courses.length || tuitionPaid <= 0) return []

  const weights = courses.map((course) => amount(course.prezzo_mensile ?? course.quota_allievo_mensile ?? course.tariffa_mensile))
  const weightsTotal = weights.reduce((sum, value) => sum + value, 0)
  const divisor = weightsTotal > 0 ? weightsTotal : courses.length

  let allocated = 0
  return courses.map((course, index) => {
    let coursePaid
    if (index === courses.length - 1) {
      coursePaid = Math.max(0, tuitionPaid - allocated)
    } else {
      const weight = weightsTotal > 0 ? weights[index] : 1
      coursePaid = Math.round((tuitionPaid * weight / divisor) * 100) / 100
      allocated += coursePaid
    }

    return {
      payment_row_id: row.pagamento_id || row.id || `${row.tesseramento_id || 'student'}-${course.id || index}`,
      student_id: String(row.tesseramento_id || row.allievo_id || row.student_id || ''),
      student_name: row.nomeCompleto || row.nome_completo || [row.nome, row.cognome].filter(Boolean).join(' ') || 'Allievo',
      course_id: String(course.id || ''),
      course_name: course.nome || course.name || course.titolo || 'Corso',
      course_level: course.livello || '',
      paid_student_quota: coursePaid,
    }
  }).filter((item) => item.course_id && item.paid_student_quota > 0)
}

/**
 * Calcola i compensi insegnanti usando ESATTAMENTE le righe già normalizzate dalla
 * sezione Pagamenti. In questo modo le due sezioni non possono più divergere su
 * mensilità, pacchetti, parziali, omaggi e tessera corsista.
 */
export function buildTeacherMonthlyPayouts({ teachers = [], courses = [], paymentRows = [], month = '' } = {}) {
  const selectedMonth = month || new Date().toISOString().slice(0, 7)
  const paidCourseRows = paymentRows.flatMap(distributeStudentPayment)

  const payouts = (teachers || []).map((teacher) => {
    const config = teacherPaymentConfig(teacher)
    const assignedCourses = (courses || []).filter((course) => (course.teachers || []).some((linkedTeacher) => sameTeacher(teacher, linkedTeacher)))
    const assignedCourseIds = new Set(assignedCourses.map((course) => String(course.id)))
    const rows = paidCourseRows.filter((row) => assignedCourseIds.has(String(row.course_id)))
    const paidTotal = rows.reduce((sum, row) => sum + row.paid_student_quota, 0)
    const studentsCount = new Set(rows.map((row) => row.student_id).filter(Boolean)).size
    const paidCourseIds = new Set(rows.map((row) => String(row.course_id)))

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
      }] : []
    } else {
      const percent = amount(config.percent)
      detailRows = rows.map((row) => {
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
        }
      })
    }

    return {
      key: lower(teacher.full_name) || String(teacher.id),
      teacher_name: teacher.full_name,
      month: selectedMonth,
      total: Math.round(total * 100) / 100,
      students_count: studentsCount,
      courses_count: assignedCourses.length,
      rows: detailRows,
    }
  })

  return payouts.sort((a, b) => b.total - a.total)
}
