import { useEffect, useRef } from 'react'
import { infoTopic, type InfoTopic } from '../missions/index.ts'
import { ruleInfo, type RuleSource } from './facts.ts'
import { useGame } from './gameContext.ts'

/** A small "INFO" link that opens a topic (MVP §10). */
export function InfoButton({ topic, label }: { topic: string; label?: string }) {
  const openInfo = useGame(s => s.openInfo)
  const t = infoTopic(topic)
  if (!t) return null
  return (
    <button type="button" className="info-button" onClick={() => openInfo(topic)} aria-label={`About ${t.title}`}>
      <span aria-hidden="true">i</span>
      {label && <span className="info-button-label">{label}</span>}
    </button>
  )
}

/** Learn pages behind a topic's rules, once each. */
function sourcesOf(topic: InfoTopic): RuleSource[] {
  const seen = new Map<string, RuleSource>()
  for (const s of topic.sections) for (const id of s.rules) for (const src of ruleInfo(id)?.sources ?? []) seen.set(src.key, src)
  return [...seen.values()]
}

/** The INFO dialog: what a concept is, why it exists, how Azure uses it, with the Learn pages behind it. */
export function InfoDialog() {
  const topicId = useGame(s => s.session.ui.info)
  const openInfo = useGame(s => s.openInfo)
  const ref = useRef<HTMLDialogElement>(null)
  const topic = topicId ? infoTopic(topicId) : undefined

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (topic && !d.open) d.showModal()
    if (!topic && d.open) d.close()
  }, [topic])

  return (
    <dialog ref={ref} className="info-dialog" aria-labelledby="info-title" onClose={() => openInfo(null)}>
      {topic && (
        <>
          <header className="info-head">
            <p className="info-kicker">INFO</p>
            <h2 id="info-title">{topic.title}</h2>
            <button type="button" className="button info-close" onClick={() => openInfo(null)}>Close</button>
          </header>
          {topic.sections.map((s, i) => (
            <section key={i} className="info-section">
              {(i === 0 || topic.sections[i - 1]?.heading !== s.heading) && <h3>{s.heading}</h3>}
              <p>
                {s.text} <span className="info-rules mono">{s.rules.join(' · ')}</span>
              </p>
            </section>
          ))}
          {topic.related.length > 0 && (
            <section className="info-section">
              <h3>Related</h3>
              <p className="info-related">
                {topic.related.map(r => (
                  <button key={r} type="button" className="link-button" onClick={() => openInfo(r)}>{infoTopic(r)?.title ?? r}</button>
                ))}
              </p>
            </section>
          )}
          <section className="info-section">
            <h3>Certification relevance</h3>
            <p>{topic.certifications.join(', ')}</p>
          </section>
          <footer className="info-sources">
            <p>Sources on Microsoft Learn:</p>
            <ul>
              {sourcesOf(topic).map(s => <li key={s.key}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}
            </ul>
          </footer>
        </>
      )}
    </dialog>
  )
}
