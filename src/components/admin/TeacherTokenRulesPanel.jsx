import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpenCheck, CheckCircle2, Info, Save } from 'lucide-react'
import { fetchOrchideaCourses } from '../../api/orchideaEntities'
import { fetchTeacherTokenRules, saveTeacherTokenRule } from '../../api/teacherTokenRules'
import { isTeacherTokenEnabled } from '../../lib/teacherPayouts'
import './TeacherTokenRulesPanel.css'

export default function TeacherTokenRulesPanel() {
  const queryClient = useQueryClient()
  const [effectiveFrom, setEffectiveFrom] = useState('2026-11')
  const [feedback, setFeedback] = useState('')
  const coursesQuery = useQuery({ queryKey: ['orchidea-courses-for-teachers'], queryFn: fetchOrchideaCourses })
  const rulesQuery = useQuery({ queryKey: ['nova-teacher-token-rules'], queryFn: fetchTeacherTokenRules })
  const courses = useMemo(() => [...(coursesQuery.data || [])].sort((a, b) =>
    String(a.nome || '').localeCompare(String(b.nome || ''), 'it')), [coursesQuery.data])
  const rules = rulesQuery.data || []

  const saveMutation = useMutation({
    mutationFn: saveTeacherTokenRule,
    onSuccess: ({ courseName, rule }) => {
      setFeedback('Regola salvata: ' + courseName + (rule.include_tokens ? ' incluso' : ' escluso') + ' dal mese ' + rule.effective_from + '.')
      queryClient.invalidateQueries({ queryKey: ['nova-teacher-token-rules'] })
    },
  })

  function changeRule(course, enabled) {
    if (saveMutation.isPending || rulesQuery.isLoading) return
    setFeedback('')
    saveMutation.mutate({ courseId: course.id, includeTokens: enabled, effectiveFrom })
  }

  return (
    <section className="page-card teacher-token-settings">
      <div className="teacher-token-settings__header">
        <span className="teacher-token-settings__icon"><BookOpenCheck size={20} /></span>
        <div>
          <h3>Lezioni a gettone nei compensi</h3>
          <p>Decidi per ogni corso se gli incassi delle singole lezioni partecipano al compenso degli insegnanti. Non modifica le quote degli allievi.</p>
        </div>
      </div>
      <div className="teacher-token-settings__notice">
        <Info size={17} />
        <span>Da novembre 2026: <strong>Caraibico incluso di default</strong>, tutti gli altri corsi esclusi. Una scelta esplicita qui sotto prevale sul valore automatico. Restano valide le percentuali individuali degli insegnanti.</span>
      </div>
      <label className="teacher-token-settings__month">
        <span>Applica nuove modifiche dal mese</span>
        <input type="month" min="2026-11" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
      </label>
      {coursesQuery.isLoading || rulesQuery.isLoading ? <p>Caricamento dei corsi e delle regole…</p> : null}
      {coursesQuery.error ? <p className="form-error">{coursesQuery.error.message}</p> : null}
      {rulesQuery.error ? <p className="form-error">{rulesQuery.error.message}</p> : null}
      {saveMutation.error ? <p className="form-error">{saveMutation.error.message}</p> : null}
      {feedback ? <p className="teacher-token-settings__success" role="status"><CheckCircle2 size={16} /> {feedback}</p> : null}
      {!coursesQuery.isLoading && !courses.length && !coursesQuery.error ? <p>Nessun corso disponibile nel catalogo Orchidea.</p> : null}
      <div className="teacher-token-settings__list">
        {!rulesQuery.error && courses.map((course) => {
          const override = rules.find((item) => String(item.course_id) === String(course.id))
          const enabled = isTeacherTokenEnabled(course, effectiveFrom, rules)
          const busy = saveMutation.isPending && saveMutation.variables?.courseId === course.id
          return (
            <div className="teacher-token-settings__row" key={course.id}>
              <div>
                <strong>{course.nome}</strong>
                <small>{override
                  ? 'Regola salvata dal ' + override.effective_from + ': ' + (override.include_tokens ? 'inclusi' : 'esclusi')
                  : /\bcaraibic[oa]\b/i.test(String(course.nome || ''))
                    ? 'Predefinito Caraibico'
                    : 'Predefinito: esclusi'}</small>
              </div>
              <label className="teacher-token-settings__switch">
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={Boolean(coursesQuery.error || rulesQuery.error) || saveMutation.isPending}
                  onChange={(event) => changeRule(course, event.target.checked)}
                />
                <span>{busy ? 'Salvo…' : enabled ? 'Contati' : 'Esclusi'}</span>
              </label>
            </div>
          )
        })}
      </div>
      <small className="teacher-token-settings__footer"><Save size={13} /> Le modifiche vengono salvate immediatamente. Se una lezione a gettone non è associata con certezza a un corso, Nova non la distribuisce arbitrariamente ad altri corsi.</small>
    </section>
  )
}
