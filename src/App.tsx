import { AnimatePresence, motion, useReducedMotion, useInView } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { asRun, asTrials, emptyCorpus, findQuestion, loadCorpus, loadDemo } from './data'
import type { CorpusPayload, DemoPayload, Edge, Question, Run, Trial } from './types'
import { buildAutolabsStudioUrl, buildDesignMessage, createEmbedBridge, isAutolabsEmbed, validateEmbedPath, type EmbedBridge } from './embed'

const img = '/assets/afterlight-fireworks.webp'

let activeEmbedBridge: EmbedBridge | null = null
function routePathFromHash(hash: string): string | null {
  const path = hash.replace(/^#\/?/, '')
  return validateEmbedPath(`/${path || 'atlas'}`)
}
function setRouteHash(path: string) {
  const nextHash = `#${path}`
  if (window.location.hash === nextHash) return
  if (activeEmbedBridge) {
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`
    window.history.replaceState(window.history.state, '', nextUrl)
    window.dispatchEvent(new Event('hashchange'))
  } else {
    window.location.hash = path
  }
}
function go(path: string, notify = true) {
  const validPath = validateEmbedPath(path)
  if (!validPath) return
  if (notify) activeEmbedBridge?.navigation(validPath)
  setRouteHash(validPath)
}
function handoffDesign(question: Question): boolean {
  const message = buildDesignMessage({ id: question.id, title: question.title, sourceUrl: question.source.url })
  if (!message || !activeEmbedBridge) return false
  return activeEmbedBridge.design(message.question)
}
function openAutolabsStudio(question: Question): boolean {
  const url = buildAutolabsStudioUrl({ id: question.id, title: question.title, sourceUrl: question.source.url })
  if (!url) return false
  window.location.assign(url)
  return true
}
function useRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/atlas')
  useEffect(() => { const onHash = () => setHash(window.location.hash || '#/atlas'); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash) }, [])
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  return { page: parts[0] || 'atlas', id: parts[1] }
}

function App() {
  const route = useRoute()
  useEffect(() => { window.scrollTo(0, 0) }, [route.page, route.id])
  const reduce = useReducedMotion()
  const [corpus, setCorpus] = useState<CorpusPayload>(emptyCorpus)
  const [demo, setDemo] = useState<DemoPayload>({})
  const [loaded, setLoaded] = useState(false)
  const embedded = isAutolabsEmbed()
  const configuredOrigins = (import.meta.env.VITE_AFTERLIGHT_EMBED_PARENT_ORIGINS || '').split(',').map((origin: string) => origin.trim()).filter(Boolean)
  const bridge = useMemo(() => createEmbedBridge(embedded && window.parent !== window, configuredOrigins), [embedded])
  useEffect(() => {
    activeEmbedBridge = bridge
    if (!bridge) return () => { if (activeEmbedBridge === bridge) activeEmbedBridge = null }
    const stopListening = bridge.listen((path) => go(path, false))
    const onHashChange = () => {
      const path = routePathFromHash(window.location.hash)
      if (path) bridge.navigation(path)
    }
    window.addEventListener('hashchange', onHashChange)
    bridge.ready()
    return () => { stopListening(); window.removeEventListener('hashchange', onHashChange); if (activeEmbedBridge === bridge) activeEmbedBridge = null }
  }, [bridge])
  useEffect(() => { Promise.all([loadCorpus(), loadDemo()]).then(([c, d]) => { setCorpus(c); setDemo(d); setLoaded(true) }) }, [])
  const question = findQuestion(corpus, route.id)
  const demoRun = asRun(demo.run)
  const content = route.page === 'questions' ? <Dossier question={question} corpus={corpus} demoRun={demoRun} embedded={embedded} />
    : route.page === 'designer' ? <Designer question={question} demoRun={demoRun} demo={demo} />
    : route.page === 'lab' ? <Lab runId={route.id === 'demo' ? demoRun?.id : route.id} demo={demo} />
    : route.page === 'results' ? <Results runId={route.id} demo={demo} question={question || findQuestion(corpus, demoRun?.questionId)} />
    : <Atlas corpus={corpus} demoRun={demoRun} loaded={loaded} embedded={embedded} />
  return <div className={`app-shell ${embedded ? 'embed-shell' : ''}`}><Header page={route.page} demoRun={demoRun} /><AnimatePresence mode="wait"><motion.main key={`${route.page}-${route.id || ''}`} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -8 }} transition={reduce ? { duration: 0 } : { duration: .35 }}>{content}</motion.main></AnimatePresence><Footer /></div>
}

function Header({ page, demoRun }: { page: string; demoRun?: Run }) {
  return <header className="topbar">
    <button className="brand" onClick={() => go('/atlas')} aria-label="Afterlight atlas"><span className="brand-mark"><i /><i /><i /></span><span>afterlight</span></button>
    <nav aria-label="Primary navigation"><button className={page === 'atlas' ? 'active' : ''} onClick={() => go('/atlas')}>Atlas</button><button className={page === 'designer' ? 'active' : ''} onClick={() => go('/designer/q-implicit-influence')}>Designer</button><button className={page === 'lab' || page === 'results' ? 'active' : ''} onClick={() => go(demoRun ? '/lab/' + demoRun.id : '/lab/pending')}>Live lab</button></nav>
    <a className="header-source" href="https://github.com/RaphaelKhalid/afterlight" target="_blank" rel="noreferrer">Source <span>↗</span></a>
  </header>
}

function Footer() { return <footer><span>AFTERLIGHT / RESEARCH SYSTEM</span><span>Evidence is scoped to each tested setting.</span><a href="https://github.com/RaphaelKhalid/afterlight" target="_blank" rel="noreferrer">GitHub ↗</a></footer> }

function Atlas({ corpus, demoRun, loaded, embedded = false }: { corpus: CorpusPayload; demoRun?: Run; loaded: boolean; embedded?: boolean }) {
  const [query, setQuery] = useState('')
  const [area, setArea] = useState('all')
  const reduce = useReducedMotion()
  const areas = useMemo(() => [...new Set(corpus.questions.map(q => q.area).filter(Boolean))], [corpus.questions])
  const questions = useMemo(() => corpus.questions.filter(q => {
    const paperIds = new Set([q.source.paperId, ...q.closestWork.map(w => w.paperId)])
    const papers = corpus.papers.filter(p => paperIds.has(p.id)).map(p => `${p.title} ${p.authors.join(' ')}`).join(' ')
    return `${q.title} ${q.summary} ${q.area} ${papers}`.toLowerCase().includes(query.toLowerCase()) && (area === 'all' || q.area === area)
  }), [corpus, query, area])
  const explore = (nextArea?: string) => { if (nextArea) setArea(nextArea); document.getElementById('atlas-map')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }) }
  return <div className="atlas-home">
    {embedded && <div className="embed-context"><div className="embed-context-copy"><p className="opening-kicker"><span /> AFTERLIGHT / RESEARCH EVIDENCE</p><h1>Inspect the question behind the experiment.</h1></div><p className="embed-context-note">Explore open questions, inspect their evidence, and bring a question into your next study.</p></div>}
    <section className="opening">
      <div className="opening-copy">
        <p className="opening-kicker"><span /> A FIELD GUIDE TO AI SAFETY</p>
        <h1>Find your<br /><em>next question.</em></h1>
        <p className="opening-description">Follow the research. Test what remains.<br />Leave evidence others can build on.</p>
        <form className="opening-search" onSubmit={event => { event.preventDefault(); explore() }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Questions, papers, or people" aria-label="Search the research atlas" /><button aria-label="Search atlas" type="submit">↵</button></form>
        <button className="opening-action" onClick={() => explore()}>Explore monitorability <span>↗</span></button>
        <div className="opening-footnote"><span className="tiny-orbit" /> A small, carefully scoped research atlas.</div>
      </div>
      <div className="opening-art" style={{backgroundImage:`url(${img})`}}><div className="opening-shade" /><PhotoLight />
        <div className="art-topline"><span>THE MONITORABILITY ATLAS</span><span>01 / FIELD NOTES</span></div>
        <button className="art-label art-label-one" onClick={() => explore('Implicit influence')}><span className="art-point" /><span><small>RESEARCH THREAD</small><strong>Hidden influence</strong></span><b>↗</b></button>
        <button className="art-label art-label-two" onClick={() => explore('Accessible reasoning')}><span className="art-point violet" /><span><small>RESEARCH THREAD</small><strong>Visible reasoning</strong></span><b>↗</b></button>
        <button className="art-label art-label-three" onClick={() => explore('Reward compatibility')}><span className="art-point" /><span><small>RESEARCH THREAD</small><strong>Reward & oversight</strong></span><b>↗</b></button>
        <div className="art-bottomline"><span>Every question starts somewhere.</span><span>EXPLORE THE CONNECTIONS ↓</span></div>
      </div>
    </section>
    {demoRun && <section className="study-entry"><div className="study-entry-label"><span className="study-signal" /> FROM THE LAB <small>Completed experiment</small></div><div className="study-entry-copy"><h2>A different choice.<br className="mobile-break" /> An incomplete explanation.</h2><p>Inspect the paired observations. The primary contextual-cue result remains inconclusive.</p></div><div className="study-entry-action"><span>{demoRun.completedTrials} trials · 20 paired cases</span><button onClick={() => go(`/lab/${demoRun.id}`)}>Open the experiment <b>↗</b></button></div></section>}
    <section id="atlas-map" className="atlas-collection">
      <div className="collection-heading"><div><p className="opening-kicker">THE RESEARCH COLLECTION</p><h2>Questions worth<br className="mobile-break" /> looking closer at.</h2></div><div className="collection-counts"><strong>{corpus.papers.length}<small>papers</small></strong><strong>{corpus.questions.length}<small>questions</small></strong><span>June–September 2026<br />+ two foundational papers</span></div></div>
      <div className="collection-toolbar"><div className="filters"><button className={area === 'all' ? 'filter active' : 'filter'} onClick={() => setArea('all')}>All questions</button>{areas.map(name=><button key={name} className={area===name?'filter active':'filter'} onClick={()=>setArea(name)}>{name}</button>)}</div>{query && <button className="clear-search" onClick={()=>setQuery('')}>Clear “{query}” ×</button>}</div>
      <div className="map-grid"><Map questions={questions} demoRun={demoRun} corpus={corpus} hasCorpus={corpus.questions.length>0} /><QuestionList questions={questions} demoRun={demoRun} loaded={loaded} reduce={!!reduce} hasCorpus={corpus.questions.length>0} /></div>
      <details className="collection-scope"><summary>About this collection and its limits <span>+</span></summary><p>{corpus.coverage?.note || 'A selected neighborhood of monitorability research, not a comprehensive map of AI safety.'} Map position indicates thematic grouping. It is not a quantitative measure of scientific distance.</p></details>
    </section>
  </div>
}

function PhotoLight() {
  const ref=useRef<HTMLDivElement>(null), visible=useInView(ref), reduced=useReducedMotion()
  const points=[[64,30],[70,51],[83,24],[89,58],[76,73],[94,37]]
  return <div className="photo-light" ref={ref} aria-hidden="true">{points.map(([x,y],i)=><motion.i key={i} style={{left:`${x}%`,top:`${y}%`}} initial={false} animate={visible&&!reduced?{opacity:[.12,.48,.12],y:[0,-3,0],scale:[.8,1.15,.8]}:{opacity:.2,y:0,scale:1}} transition={visible&&!reduced?{duration:7+i,repeat:Infinity,ease:'easeInOut',delay:i*.6}:{duration:0}} />)}</div>
}
function Map({ questions, demoRun, corpus, hasCorpus }: { questions: Question[]; demoRun?: Run; corpus: CorpusPayload; hasCorpus: boolean }) {
  const [selectedEdge, setSelectedEdge] = useState<Edge | undefined>()
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => { if ((event.target as Element).closest('button, a')) return; drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }; event.currentTarget.setPointerCapture(event.pointerId) }
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => { if (drag.current) setOffset({ x: drag.current.ox + event.clientX - drag.current.x, y: drag.current.oy + event.clientY - drag.current.y }) }
  const endDrag = () => { drag.current = null }
  const sourceLabel = (id: string) => corpus.papers.find((paper) => paper.id === id)?.title || id
  const targetLabel = (id: string) => corpus.questions.find((question) => question.id === id)?.title || id
  return <div className="map-column"><div className="map-card"><div className="map-tools" aria-label="Map controls"><button onClick={() => setZoom((value) => Math.min(1.45, value + .1))} aria-label="Zoom in">+</button><span className="mono">{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.max(1, value - .1))} aria-label="Zoom out">−</button><button onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }) }} aria-label="Reset map">reset</button></div><div className="map-viewport" onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}><div className="map-stage" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}><div className="map-texture" style={{ backgroundImage: `url(${img})` }} /><div className="map-overlay" /><div className="map-caption"><span className="mono">MAP / 01</span><span>SELECTED NEIGHBORHOOD</span></div><svg className="map-lines" viewBox="0 0 800 500" aria-hidden="true"><path d="M90 365 C220 300 210 160 366 180 S550 290 716 95" /><path d="M120 110 C280 200 390 110 510 210 S650 370 760 360" /></svg>
    {questions.map((q, i) => { const x = q.position?.x ?? (17 + (i * 29) % 70); const y = q.position?.y ?? (28 + (i * 37) % 57); const isDemo = q.id === demoRun?.questionId; return <button key={q.id} className={`map-point ${isDemo ? 'evidence' : ''}`} style={{ left: `${x}%`, top: `${y}%` }} onClick={(event) => { event.stopPropagation(); go(`/questions/${q.id}`) }} title={q.title}><span className="point-core" /><span className="point-label" style={{left:x>70?'auto':12,right:x>70?18:'auto'}}>{q.title}</span></button> })}
    {!questions.length && <div className="map-empty"><span className="empty-orbit">+</span><strong>{hasCorpus ? 'No matching questions' : 'Map waiting for source data'}</strong><p>{hasCorpus ? 'Clear the search or change the filter to see another question.' : 'The public corpus will appear here when it is available.'}</p></div>}
    </div></div><div className="map-legend"><span><i className="dot gold" /> question</span><span><i className="dot violet" /> evidence attached</span></div></div>{corpus.edges.length ? <details className="map-edges"><summary>Evidence connections <span>+</span></summary>{[...corpus.edges.filter(e=>e.target===demoRun?.questionId),...corpus.edges.filter(e=>e.target!==demoRun?.questionId)].slice(0,5).map((edge) => <button key={edge.id} className={selectedEdge?.id === edge.id ? 'selected' : ''} onClick={() => setSelectedEdge(edge)} aria-pressed={selectedEdge?.id === edge.id}><span>{edge.type}</span><strong>{sourceLabel(edge.source)} ↗ {targetLabel(edge.target)}</strong></button>)}{selectedEdge && <div className="edge-detail"><span className="mono">{selectedEdge.type}</span><p>{selectedEdge.explanation}</p>{selectedEdge.evidenceUrl && <a href={selectedEdge.evidenceUrl} target="_blank" rel="noreferrer">Open supporting source ↗</a>}</div>}</details> : null}</div>
}
function QuestionList({ questions, demoRun, loaded, reduce, hasCorpus }: { questions: Question[]; demoRun?: Run; loaded: boolean; reduce: boolean; hasCorpus: boolean }) {
  return <div className="question-list"><div className="list-meta"><span>{questions.length} {questions.length === 1 ? 'question' : 'questions'}</span><span className="mono">{loaded ? 'SELECT A QUESTION' : 'LOADING'}</span></div>{questions.map((q, i) => <motion.button key={q.id} className="question-row" onClick={() => go(`/questions/${q.id}`)} initial={reduce ? false : { opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * .04 }}><span className="row-index">0{i + 1}</span><span className="row-main"><strong>{q.title}</strong><small>{q.area} · {q.status}</small></span><span className="row-arrow">↗</span></motion.button>)}{!questions.length && <div className="pending-card"><span className="mono">{hasCorpus ? 'NO MATCHING QUESTIONS' : 'NO LOCAL QUESTIONS'}</span><p>{hasCorpus ? 'Clear the search or change the filter to see another question.' : 'Research entries are loaded from the read-only corpus or the API. There is nothing to claim here until one is available.'}</p></div>}{demoRun && <button className="demo-link" onClick={() => go(`/results/${demoRun.id}`)}><span className="demo-signal" /><span><small>COMPLETED DEMO</small><strong>Inspect the latest evidence</strong></span><span>↗</span></button>}</div>
}

function Back({ label = 'Back to atlas', to = '/atlas' }: { label?: string; to?: string }) { return <button className="back-link" onClick={() => go(to)}>↖ {label}</button> }

function Dossier({ question, corpus, demoRun, embedded = false }: { question?: Question; corpus: CorpusPayload; demoRun?: Run; embedded?: boolean }) {
  const [attempts, setAttempts] = useState<AttemptRecord[]>([])
  useEffect(() => { setAttempts([]); if (!question) return; fetch('/api/attempts?questionId=' + encodeURIComponent(question.id)).then((r) => r.ok ? r.json() : null).then((data) => { if (Array.isArray(data?.attempts)) setAttempts(data.attempts) }).catch(() => undefined) }, [question?.id])
  if (!question) return <Pending title="Question dossier" detail="Select a question from the atlas once the public corpus is loaded." />
  const sourcePaper = corpus.papers.find((p) => p.id === question.source.paperId)
  const paperLabel = (id: string) => corpus.papers.find((paper) => paper.id === id)?.title || id
  return <section className="detail-page"><Back /><div className="dossier-head"><div className="dossier-kicker"><span className="status-dot" /> {question.status} <span className="origin">{question.origin.replace('-', ' ')}</span></div><h1>{question.title}</h1><p className="dossier-summary">{question.summary}</p><div className="dossier-meta"><span><b>AREA</b>{question.area}</span><span><b>EST. RUN</b>{question.estimatedMinutes ? `${question.estimatedMinutes} min` : 'Unspecified'} · {question.estimatedCostUsd != null ? `$${question.estimatedCostUsd.toFixed(2)}` : 'cost pending'}</span><span><b>ACCESS</b>{question.access || 'See contract'}</span></div></div><div className="dossier-grid"><article><SectionLabel>Source passage</SectionLabel><blockquote>{question.source.passage || 'The source passage is not available in the current record.'}</blockquote><div className="source-line"><span className="source-mark">↗</span><span>{sourcePaper?.title || question.source.paperId}<small>{question.source.section || 'Source section not recorded'} · {question.source.version || 'version unspecified'}</small></span><a href={question.source.url} target="_blank" rel="noreferrer">Open source</a></div><SectionLabel>Why this matters</SectionLabel><p className="body-copy">{question.whyItMatters}</p></article><aside><SectionLabel>Closest work</SectionLabel>{question.closestWork.length ? question.closestWork.map((work) => <div className="closest" key={work.paperId}><span className="mono">{paperLabel(work.paperId)}</span><p>{work.finding}</p><small>Remaining mismatch: {work.mismatch}</small></div>) : <div className="pending-card">Closest work has not been assessed in this record.</div>}<OwnerAction mode="investigate" questionId={question.id} query={String(objectRecord(objectRecord(question.search).lastInvestigation).query || '')} /><SectionLabel>Search record</SectionLabel><LiveInvestigation search={question.search} /><div className="search-record"><span className="mono">{question.search.date || 'date pending'}</span><p>{question.search.coverage || 'Coverage statement is not recorded.'}</p>{question.search.queries?.length ? <details><summary>{question.search.queries.length} recorded queries</summary><ul>{question.search.queries.map((q) => <li key={q}>{q}</li>)}</ul></details> : null}</div>{attempts.length ? <><SectionLabel>Attempts</SectionLabel><div className="attempts-list">{attempts.map((attempt) => <div className="attempt-row" key={attempt.id}><span className="status-dot" /><span><strong>{attempt.label || 'Research participation'}</strong><small>{attempt.status || 'status not recorded'} · {attempt.contributor || attempt.participant || 'Participant'}</small></span>{(attempt.resultRunId || attempt.resultUrl || attempt.artifactUrl) && <a href={attempt.resultRunId ? '#/results/' + attempt.resultRunId : attempt.resultUrl || attempt.artifactUrl} target="_blank" rel="noreferrer">Open ↗</a>}</div>)}</div></> : null}</aside></div><div className="dossier-footer"><div><SectionLabel>Uncertainty</SectionLabel><p>{question.uncertainty}</p></div><div className="next-step"><span className="mono">NEXT AVAILABLE STEP</span>{question.executable ? <><strong>Review the executable contract</strong><button className="primary-action small" onClick={() => { if (!embedded || !handoffDesign(question)) go(`/designer/${question.id}`) }}>{embedded ? 'Design in Auto Labs ↗' : 'Open designer ↗'}</button></> : <><p>This question does not have a reviewed executable contract yet.</p><button className="primary-action small" onClick={() => { if (!(embedded && handoffDesign(question))) openAutolabsStudio(question) }}>Design in Auto Labs ↗</button></>}{demoRun?.questionId === question.id && <button className="evidence-return" onClick={() => go(`/results/${demoRun.id}`)}>Evidence attached to this question ↗</button>}</div></div></section>
}

function SectionLabel({ children }: { children: string }) { return <p className="section-label">{children}</p> }

type ContractRecord = { id: string; hash: string; questionId?: string; status?: string; name?: string; title?: string; hypothesis?: string; primaryOutcome?: string; stoppingRule?: string; observationSurface?: string; independentVariable?: string; provider?: string; model?: string; maxCapUsd?: number; totalTrials?: number; conditions?: unknown[]; settings?: Record<string, unknown>; estimate?: Record<string, unknown>; [key: string]: unknown }
type AttemptRecord = { id: string; status?: string; createdAt?: string; resultUrl?: string; artifactUrl?: string; label?: string; contributor?: string; participant?: string; resultRunId?: string }

function Designer({ question, demoRun, demo }: { question?: Question; demoRun?: Run; demo?: DemoPayload }) {
  const [contracts, setContracts] = useState<ContractRecord[]>([])
  const [token, setToken] = useState(() => sessionStorage.getItem('afterlight_owner_token') || '')
  const [authMessage, setAuthMessage] = useState('')
  useEffect(() => { fetch('/api/contracts').then((r) => r.ok ? r.json() : null).then((data) => { if (Array.isArray(data?.contracts)) setContracts(data.contracts) }).catch(() => undefined) }, [])
  const staticContract = demo?.contract && typeof (demo.contract as Record<string, unknown>).id === 'string' && typeof (demo.contract as Record<string, unknown>).hash === 'string' ? demo.contract as ContractRecord : undefined
  const contract = contracts.find((item) => item.questionId === question?.id && item.id === demoRun?.contractId) || contracts.find((item) => item.questionId === question?.id) || (staticContract?.questionId === question?.id ? staticContract : undefined)
  if (!question && !demoRun) return <Pending title="Experiment designer" detail="A validated contract will appear here after a question is selected." />
  const title = question?.title || 'Selected research question'
  const cap = typeof contract?.maxCapUsd === 'number' ? contract.maxCapUsd : question?.estimatedCostUsd
  const canAuthorize = Boolean(question && contract?.id && contract.hash && contract.status === 'validated')
  return <section className="detail-page designer-page"><Back /><div className="designer-top"><div><p className="eyebrow dark"><span className="eyebrow-line" /> EXECUTABLE DESIGN</p><h1>Make the limit<br /><em>part of the method.</em></h1></div><div className="freeze-badge"><span className="lock">⌑</span><span>CONTRACT STATUS<strong>{canAuthorize ? 'Validated' : 'Pending validation'}</strong></span></div></div><div className="designer-question"><span className="mono">QUESTION</span><h2>{title}</h2><p>{question?.summary || 'The experiment record is not yet attached to a question.'}</p></div><div className="contract-grid"><div className="contract-main"><SectionLabel>Protocol outline</SectionLabel><RoleDiagram /><div className="protocol-rows"><ProtocolRow n="01" label="Independent variable" value={String(contract?.independentVariable || 'How context is delivered across no cue, aside, direct request, neutral context, and relevant detail')} /><ProtocolRow n="02" label="Primary outcome" value={String(contract?.primaryOutcome || 'Awaiting validated contract')} /><ProtocolRow n="03" label="Conditions" value={Array.isArray(contract?.conditions) ? contract!.conditions.map((condition) => typeof condition === 'string' ? condition : String((condition as Record<string, unknown>).label || (condition as Record<string, unknown>).id || 'condition')).join(', ') : 'Awaiting validated contract'} /><ProtocolRow n="04" label="Stopping rule" value={String(contract?.stoppingRule || 'Awaiting validated contract')} /><ProtocolRow n="05" label="Model and settings" value={formatFrozenSettings(contract)} /><ProtocolRow n="06" label="Observed surface" value={String(contract?.observationSurface || 'Recorded in the frozen contract')} /></div></div><aside className="contract-aside"><SectionLabel>Budget boundary</SectionLabel><div className="budget-number">{cap != null ? `$${cap.toFixed(2)}` : 'cap pending'}</div><p>Reserved before dispatch. Returned usage is reconciled after each call. OpenAI cost is a token-based estimate.</p><div className="aside-rule" /><SectionLabel>Frozen contract</SectionLabel>{contract ? <div className="contract-facts"><span><small>ID</small><strong>{contract.id}</strong></span><span><small>HASH</small><strong>{contract.hash}</strong></span><span><small>TRIALS</small><strong>{String(contract.totalTrials ?? 'recorded in contract')}</strong></span></div> : <div className="pending-card">The exact validated contract has not been returned by the API yet. This view will not send a placeholder run.</div>}<p className="record-note">Expected cost {contract?.estimate ? `$${Number(contract.estimate.lowUsd).toFixed(2)} to $${Number(contract.estimate.highUsd).toFixed(2)}` : 'recorded in contract'}. At most {String(contract?.maxCalls || 'the frozen number of')} provider calls. No automatic paid retries.</p><div className="owner-access"><label htmlFor="owner-token">Owner access key <span>(this session only)</span></label><input id="owner-token" type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste to authorize a run" autoComplete="off" /></div>{authMessage && <p className="control-message">{authMessage}</p>}{canAuthorize ? <button className="primary-action run-button" onClick={() => startRun(question!.id, contract!.id, contract!.hash, cap ?? 0, token, setAuthMessage)}>Review and authorize run <span>↗</span></button> : <div className="pending-card">A reviewed contract with an exact hash is required before execution.</div>}</aside></div></section>
}
function ProtocolRow({ n, label, value }: { n: string; label: string; value: string }) { return <div className="protocol-row"><span className="mono">{n}</span><span>{label}</span><strong>{value}</strong></div> }
function formatFrozenSettings(contract?: ContractRecord) {
  if (!contract) return 'Awaiting validated contract'
  const settings = objectRecord(contract.settings)
  return [String(contract.provider || 'provider pending'), String(contract.model || 'model pending'), settings.subjectMaxCompletionTokens ? 'output ' + settings.subjectMaxCompletionTokens + ' tokens' : '', settings.reasoningEffort ? 'reasoning ' + settings.reasoningEffort : ''].filter(Boolean).join(' / ')
}
function conditionLabel(id: string) { return ({ baseline: 'No cue', implicit: 'Contextual aside', explicit: 'Direct request', neutral_control: 'Neutral context', relevant_positive: 'Relevant cost detail' } as Record<string,string>)[id] || id.replaceAll('_', ' ') }
function PairedResults({ analysis }: { analysis?: unknown }) {
  const source = objectRecord(objectRecord(analysis).caseClusteredPairedDeltas)
  const rows = Object.entries(source).flatMap(([key, value]) => { const r=objectRecord(value); const ci=Array.isArray(r.ci95) ? r.ci95 : []; return typeof r.mean==='number' && typeof ci[0]==='number' && typeof ci[1]==='number' ? [{key, label:conditionLabel(key.replace('_minus_baseline','')), mean:r.mean, low:ci[0], high:ci[1], n:Number(r.nCases)}] : [] })
  if (!rows.length) return null
  const minimum=Math.min(-.2,...rows.map(r=>r.low-.05)), maximum=Math.max(.8,...rows.map(r=>r.high+.05))
  const x=(v:number)=>15+(v-minimum)/(maximum-minimum)*470
  const pp=(v:number)=>(v>0?'+':'')+Math.round(v*100)
  return <div className="paired-chart"><SectionLabel>Change from no cue</SectionLabel><p className="chart-note">Percentage points with 95% case-bootstrap intervals. A line crossing zero includes both a decrease and an increase.</p>{rows.map(row=><div className="interval-row" key={row.key}><div className="interval-heading"><strong>{row.label}{row.key.startsWith('implicit_') && <small> PRIMARY</small>}</strong><span>{pp(row.mean)} pp <small>[{pp(row.low)}, {pp(row.high)}]</small></span></div><svg viewBox="0 0 500 30" role="img" aria-label={`${row.label}: ${pp(row.mean)} percentage points, interval ${pp(row.low)} to ${pp(row.high)}, ${row.n} paired cases`}><line x1={x(0)} x2={x(0)} y1="0" y2="30" className="paired-axis"/><line x1={x(row.low)} x2={x(row.high)} y1="15" y2="15" className="paired-interval"/><line x1={x(row.low)} x2={x(row.low)} y1="10" y2="20" className="paired-interval"/><line x1={x(row.high)} x2={x(row.high)} y1="10" y2="20" className="paired-interval"/><circle cx={x(row.mean)} cy="15" r="5" className="paired-point"/></svg><small className="interval-n">{row.n} paired cases</small></div>)}<div className="interval-axis"><span>Decrease</span><span>0 = no change</span><span>Increase</span></div></div>
}
function RoleDiagram() { return <div className="role-diagram" aria-label="Experiment roles: subject, cue, monitor, and scorer"><svg viewBox="0 0 700 180" role="img"><path className="branch branch-a" d="M72 90 C175 90 180 38 280 38 S420 80 474 80" /><path className="branch branch-b" d="M72 90 C175 90 190 143 280 143 S420 98 474 98" /><path className="branch branch-c" d="M474 89 C535 89 548 42 620 42" /><path className="branch branch-d" d="M474 89 C535 89 550 135 620 135" /><circle className="role-node node-subject" cx="72" cy="90" r="22" /><circle className="role-node node-cue" cx="280" cy="38" r="17" /><circle className="role-node node-control" cx="280" cy="143" r="17" /><circle className="role-node node-monitor" cx="474" cy="89" r="22" /><circle className="role-node node-score" cx="620" cy="42" r="17" /><circle className="role-node node-check" cx="620" cy="135" r="17" /></svg><div className="role-labels"><span className="r-subject">subject<br /><small>model output</small></span><span className="r-cue">cue condition</span><span className="r-control">control</span><span className="r-monitor">monitor<br /><small>visible rationale</small></span><span className="r-score">answer shift</span><span className="r-check">scorer</span></div></div> }

async function startRun(questionId: string, contractId: string, contractHash: string, capUsd: number, token: string, setMessage: (message: string) => void) {
  if (!contractId || !contractHash) { setMessage('A validated contract hash is required.'); return }
  if (token) sessionStorage.setItem('afterlight_owner_token', token)
  try {
    const response = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ contractId, contractHash, capUsd, questionId }) })
    if (response.ok) { const data = await response.json(); if (data?.run?.id) go(`/lab/${data.run.id}`); else setMessage('Run queued without an id. Check the run index.') }
    else setMessage(response.status === 401 ? 'Owner authorization is required to spend provider credits.' : 'The run was not queued. The frozen contract or cap was rejected.')
  } catch { setMessage('The response was interrupted. Check the run record before trying again.') }
}
function objectRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function Lab({ runId, demo }: { runId?: string; demo: DemoPayload }) {
  const [run, setRun] = useState<Run | undefined>(() => asRun(demo.run)?.id === runId ? asRun(demo.run) : undefined)
  const [trials, setTrials] = useState<Trial[]>(() => asRun(demo.run)?.id === runId ? asTrials(demo.trials) : [])
  const [message, setMessage] = useState('')
  const [liveRecord, setLiveRecord] = useState(false)
  const [ownerToken] = useState(() => sessionStorage.getItem('afterlight_owner_token') || '')
  const [focusCaseId, setFocusCaseId] = useState(() => asTrials(demo.trials)[0]?.caseId || '')
  const [focusCondition, setFocusCondition] = useState('')
  useEffect(() => { const local = asRun(demo.run); if (local?.id === runId) { setRun(local); const localTrials = asTrials(demo.trials); if (localTrials.length) setTrials(localTrials) } }, [demo.run, demo.trials, runId])
  useEffect(() => {
    if (!runId || ['pending', 'authorization-required', 'unavailable'].includes(runId)) return
    let disposed = false
    const refresh = async () => {
      const [runResponse, trialResponse] = await Promise.all([fetch(`/api/runs/${runId}`).then((r) => r.ok ? r.json() : null).catch(() => null), fetch(`/api/runs/${runId}/trials`).then((r) => r.ok ? r.json() : null).catch(() => null)])
      if (disposed) return
      const remote = asRun(runResponse?.run || runResponse)
      if (remote) { setRun(remote); setLiveRecord(true) } else setLiveRecord(false)
      const next = asTrials(trialResponse?.trials || trialResponse)
      if (next.length) setTrials(next)
    }
    refresh()
    const timer = setInterval(refresh, 3000)
    return () => { disposed = true; clearInterval(timer) }
  }, [runId])
  const caseIds = useMemo(() => [...new Set(trials.map((trial) => trial.caseId).filter(Boolean))], [trials])
  const focusTrials = useMemo(() => trials.filter((trial) => trial.caseId === focusCaseId), [trials, focusCaseId])
  const focusConditions = useMemo(() => [...new Set(focusTrials.map((trial) => trial.condition).filter(Boolean))], [focusTrials])
  useEffect(() => { if (caseIds.length && !caseIds.includes(focusCaseId)) setFocusCaseId(caseIds[0]) }, [caseIds, focusCaseId])
  useEffect(() => { if (focusConditions.length && !focusConditions.includes(focusCondition)) setFocusCondition(focusConditions.find((condition) => condition === 'explicit') || focusConditions.find((condition) => !isBaselineCondition(condition)) || focusConditions[0]) }, [focusConditions, focusCondition])
  if (!run || ['pending', 'authorization-required', 'unavailable'].includes(runId || '')) return <Pending title="Live laboratory" detail={runId === 'authorization-required' ? 'Running a new experiment requires owner authorization. No provider call was made.' : runId === 'unavailable' ? 'The experiment API is unavailable. The page remains read-only and no work was started.' : 'A run becomes visible here after a validated contract is authorized.'} />
  const conditions = run.conditions || []
  const terminal = ['completed', 'failed', 'stopped'].includes(run.status)
  const canPause = ownerToken && run.status === 'running'
  const canResume = ownerToken && run.status === 'paused'
  const canStop = ownerToken && ['queued', 'running', 'paused'].includes(run.status)
  const contractRecord = objectRecord(demo.contract)
  const experimentHeadline = run.summary?.headline || (typeof contractRecord.title === 'string' ? contractRecord.title : typeof contractRecord.name === 'string' ? contractRecord.name : 'Scientific observation')
  const experimentHypothesis = run.summary?.hypothesis || (typeof contractRecord.hypothesis === 'string' ? contractRecord.hypothesis : 'within a bounded setting.')
  const experimentOutcome = run.summary?.primaryOutcome || (typeof contractRecord.primaryOutcome === 'string' ? contractRecord.primaryOutcome : 'A bounded run with a visible protocol and recorded observations.')
  return <section className="detail-page lab-page"><Back label="Back to question" to={`/questions/${run.questionId}`} /><div className="lab-head"><div className="lab-head-copy"><div className="dossier-kicker"><span className={`status-dot ${run.status === 'completed' ? 'done' : ''}`} /> {run.status}</div><h1>{experimentHeadline}</h1><p className="lab-hypothesis"><span className="mono">HYPOTHESIS</span>{experimentHypothesis}</p><p className="lab-outcome">{experimentOutcome}</p></div><div className="run-id"><span className="mono">{run.status === 'completed' ? 'RECORDED STUDY' : 'EXPERIMENT RUN'}</span><strong>{trials[0]?.model || 'Frozen protocol'}</strong><small>{caseIds.length} cases · {conditions.length} conditions</small><details className="run-reference"><summary>Run reference</summary><small>{run.id}<br />Contract {run.contractHash}</small></details></div></div><div className="lab-metrics"><Metric label="TRIALS" value={`${run.completedTrials} / ${run.totalTrials}`} detail={`${run.failedTrials} failed`} /><Metric label="SPEND" value={formatUsd(run.spentUsd)} detail={`${run.costStatus}`} /><Metric label="CAP" value={`$${run.capUsd.toFixed(2)}`} detail="reserved limit" /><Metric label="STATE" value={run.status} detail="persistent run state" /></div><div className="lab-shortcuts"><button className="evidence-return" onClick={() => document.querySelector('.observation-focus')?.scrollIntoView({behavior: 'smooth', block: 'start'})}>Compare the observations</button>{run.status === 'completed' && <button className="primary-action small" onClick={() => go(`/results/${run.id}`)}>Inspect results</button>}</div>{caseIds.length ? <ObservationFocus trials={trials} caseIds={caseIds} focusCaseId={focusCaseId} setFocusCaseId={setFocusCaseId} focusConditions={focusConditions} focusCondition={focusCondition} setFocusCondition={setFocusCondition} /> : <div className="focus-pending">A paired observation appears when a returned case has at least one recorded trial.</div>}<div className="lab-grid"><div className="observation-panel"><div className="panel-head"><SectionLabel>Condition branches</SectionLabel><span className="mono">{!liveRecord ? 'SAVED SNAPSHOT' : run.status === 'completed' ? 'RECORDED RUN' : 'LIVE RECORD'}</span></div>{conditions.length ? conditions.map((c, i) => { const completed = trials.filter((t) => (t.condition === c.id || t.condition === c.label) && t.status === 'completed').length; const planned = trials.filter((t) => t.condition === c.id || t.condition === c.label).length; return <div className="condition" key={c.id || c.label}><span className="condition-index">0{i + 1}</span><span className="condition-swatch" style={{ background: c.color || ['#a98038', '#8d78b7', '#428a8a'][i % 3] }} /><span><strong>{c.label}</strong><small>{c.description || 'Condition description recorded in contract.'}</small></span><span className="condition-count">{completed}/{planned} complete</span></div> }) : <div className="pending-card">Condition records are not available for this run.</div>}<div className="trial-list"><div className="panel-head"><SectionLabel>Trials and observations</SectionLabel><span className="mono">{trials.length} returned</span></div>{trials.map((trial) => <TrialRow key={trial.id} trial={trial} />)}{!trials.length && <div className="empty-trials">No trial observations have been returned yet.</div>}</div></div><aside className="lab-side"><SectionLabel>Run controls</SectionLabel><p>Controls are shown for the owner. A public viewer cannot spend credits.</p>{ownerToken ? <><div className="control-row"><button disabled={!canPause} onClick={() => controlRun(run.id, 'pause', ownerToken, setMessage)}>Pause</button><button disabled={!canResume} onClick={() => controlRun(run.id, 'resume', ownerToken, setMessage)}>Resume</button><button className="stop" disabled={!canStop} onClick={() => controlRun(run.id, 'stop', ownerToken, setMessage)}>Stop</button></div><p className="record-note">{terminal ? 'This run is terminal and cannot be changed.' : `Current state: ${run.status}. Controls follow the persisted run state.`}</p></> : <div className="pending-card">Owner token required for run controls.</div>}{message && <p className="control-message">{message}</p>}<div className="aside-rule" /><details className="technical-events"><summary>Research event log</summary><p className="record-note">Persisted technical records, including the coordinator recovery.</p><div className="event-log">{run.events?.length ? run.events.map((event, i) => <div key={`${event.at || event.createdAt}-${i}`}><span className="event-line" /><span><small>{event.at || event.createdAt ? new Date(event.at || event.createdAt || '').toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : 'time not recorded'}</small><strong>{(event.label || event.type || 'run event').replaceAll('_',' ')}</strong>{Boolean(event.detail) && <p>{typeof event.detail === 'string' ? event.detail : formatRecord(event.detail)}</p>}</span></div>) : <p className="muted">No events recorded yet.</p>}</div></details>{run.status === 'completed' && <button className="evidence-return" onClick={() => go(`/results/${run.id}`)}>Inspect results</button>}</aside></div></section>
}
function isBaselineCondition(condition: string) { return /^(baseline|no[_ -]?cue)$/i.test(condition) }
function formatUsd(value: number) { return value < 0.1 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}` }
function parseJsonRecord(value: unknown): Record<string, unknown> { if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>; if (typeof value !== 'string') return {}; try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {} } catch { return {} } }
function caseDetails(trial?: Trial) { const input = objectRecord(trial?.input); const fallback = objectRecord(input.case); const record = parseJsonRecord(fallback.input); return { stem: String(record.stem || fallback.stem || 'Decision case'), optionA: String(record.option_a || fallback.optionA || 'Option A not recorded'), optionB: String(record.option_b || fallback.optionB || 'Option B not recorded'), criteria: String(record.criteria || fallback.criteria || 'Criteria not recorded'), candidateCue: String(objectRecord(trial?.output).cue || record.nudge || fallback.nudge || 'Candidate cue not recorded') } }
function deliveredContext(trial?: Trial) {
  if (!trial) return 'No observation returned'
  if (trial.condition === 'baseline') return 'No added context. Choose using only the stated criteria.'
  const messages=objectRecord(objectRecord(trial.output).subjectRequest).messages
  const user=(Array.isArray(messages)?messages:[]).map(objectRecord).find(message=>message.role==='user')
  const lines=typeof user?.content==='string' ? user.content.split('\n') : []
  return lines.find(line=>/^(As background context|The user explicitly asks|A directly relevant fact|The person asking this question)/.test(line)) || 'Exact context is not available in this record.'
}
function scientificFields(trial: Trial) {
  const output = objectRecord(trial.output)
  const raw = Object.keys(objectRecord(trial.raw)).length ? objectRecord(trial.raw) : output
  const input = objectRecord(trial.input)
  const condition = objectRecord(input.condition)
  const monitor = objectRecord(raw.monitor)
  const monitorContent = objectRecord(objectRecord((monitor.choices as unknown[])?.[0]).message).content
  let monitorVerdict = trial.monitorVerdict || (typeof raw.monitorVerdict === 'string' ? raw.monitorVerdict : 'Not recorded')
  let monitorExplanation = ''
  if (typeof monitorContent === 'string') { try { const parsed = JSON.parse(monitorContent) as Record<string, unknown>; monitorVerdict = typeof parsed.verdict === 'string' ? parsed.verdict : monitorVerdict; monitorExplanation = typeof parsed.explanation === 'string' ? parsed.explanation : '' } catch {} }
  const choice = typeof raw.choice === 'string' ? raw.choice : trial.choice || trial.answer || ''
  const rationale = typeof raw.rationale === 'string' ? raw.rationale : trial.rationale || ''
  const observationSurface = typeof raw.observationSurface === 'string' ? raw.observationSurface : 'Visible final rationale only'
  return { cue: String(condition.label || trial.condition), target: trial.expectedAnswer || '', choice, rationale, monitorVerdict, monitorExplanation, observationSurface }
}
function ObservationFocus({ trials, caseIds, focusCaseId, setFocusCaseId, focusConditions, focusCondition, setFocusCondition }: { trials: Trial[]; caseIds: string[]; focusCaseId: string; setFocusCaseId: (id: string) => void; focusConditions: string[]; focusCondition: string; setFocusCondition: (condition: string) => void }) {
  const caseTrials = trials.filter((trial) => trial.caseId === focusCaseId)
  const baseline = caseTrials.find((trial) => isBaselineCondition(trial.condition)) || caseTrials[0]
  const selected = caseTrials.find((trial) => trial.condition === focusCondition) || caseTrials.find((trial) => trial !== baseline && !isBaselineCondition(trial.condition)) || baseline
  const details = caseDetails(selected || baseline)
  return <section className="observation-focus" aria-labelledby="focus-title"><div className="focus-head"><div><SectionLabel>Paired observation · recorded study</SectionLabel><h2 id="focus-title">One case, two records</h2><p>Compare the baseline and one condition from the same recorded case.</p></div><div className="focus-selectors"><label>CASE<select value={focusCaseId} onChange={(event) => setFocusCaseId(event.target.value)}>{caseIds.map((id) => <option key={id} value={id}>{caseDetails(trials.find(trial=>trial.caseId===id)).stem}</option>)}</select></label>{focusConditions.length > 1 && <label>COMPARE<select value={focusCondition} onChange={(event) => setFocusCondition(event.target.value)}>{focusConditions.map((condition) => <option key={condition} value={condition}>{conditionLabel(condition)}</option>)}</select></label>}</div></div><div className="case-context"><span className="mono">DECISION CASE</span><strong>{details.stem}</strong><div className="case-options"><span><small>OPTION A</small>{details.optionA}</span><span><small>OPTION B</small>{details.optionB}</span></div><span className="case-criteria"><small>STATED CRITERIA</small>{details.criteria}</span><span className="case-cue"><small>CANDIDATE MONITOR CUE</small>{details.candidateCue}</span></div><p className="focus-surface">Observed surface: one-sentence final explanations. Internal reasoning content is not available. This paired record is illustrative; use aggregate results to assess the effect.</p><div className="focus-cards"><ObservationCard label="BASELINE" trial={baseline} /><ObservationCard label="SELECTED CONDITION" trial={selected} /></div></section>
}
function ObservationCard({ label, trial }: { label: string; trial?: Trial }) { const fields = trial ? scientificFields(trial) : undefined; return <article className="focus-card"><header><div><span className="mono">{label}</span><strong>{trial ? conditionLabel(trial.condition) : 'No record returned'}</strong></div><span className={`focus-status ${trial?.status || 'pending'}`}>{trial?.status || 'pending'}</span></header><dl><div><dt>DELIVERED CONTEXT</dt><dd>{deliveredContext(trial)}</dd></div><div className="observed-choice"><dt>OBSERVED CHOICE</dt><dd className="choice-letter">{fields?.choice || 'Pending'}</dd></div><div><dt>VISIBLE RATIONALE</dt><dd>{fields?.rationale || 'Pending'}</dd></div><div><dt>MONITOR VERDICT</dt><dd>{fields?.monitorVerdict || 'Pending'}</dd>{fields?.monitorExplanation && <details className="monitor-explanation"><summary>Inspect the monitor judgment</summary><small>{fields.monitorExplanation}</small></details>}</div></dl></article> }
async function controlRun(id: string, action: 'pause' | 'resume' | 'stop', token: string, setMessage: (x: string) => void) { const res = await fetch(`/api/runs/${id}/control`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action }) }).catch(() => null); setMessage(res?.ok ? `Request recorded: ${action}.` : 'Owner authorization is required for controls.') }
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="metric"><span className="mono">{label}</span><strong>{value}</strong><small>{detail}</small></div> }
function formatRecord(value: unknown): string { if (typeof value === 'string') return value; if (value == null) return 'Not recorded'; try { return JSON.stringify(value, null, 2) } catch { return String(value) } }
function TrialRow({ trial }: { trial: Trial }) { const input = trial.input && typeof trial.input === 'object' ? trial.input as Record<string, unknown> : {}; const output = trial.output && typeof trial.output === 'object' ? trial.output as Record<string, unknown> : {}; const response = trial.answer || (typeof output.answer === 'string' ? output.answer : 'Not recorded'); const monitor = trial.monitorVerdict || (typeof output.monitorVerdict === 'string' ? output.monitorVerdict : 'Not recorded'); const cue = typeof input.condition === 'object' && input.condition && 'label' in input.condition ? String((input.condition as Record<string, unknown>).label) : trial.condition; return <details className="trial-row"><summary><span className={`trial-status ${trial.status}`} title={trial.status} /><span className="mono">{trial.caseId}</span><strong>{trial.condition}</strong><span>{monitor}</span><span>⌄</span></summary><div className="trial-body"><div className="trial-facts"><span><small>CUE / CONDITION</small><strong>{cue}</strong></span><span><small>ACTUAL RESPONSE</small><strong>{response}</strong></span><span><small>MONITOR VERDICT</small><strong>{monitor}</strong></span></div><div><SectionLabel>Input record</SectionLabel><pre className="record">{formatRecord(trial.input)}</pre></div><div><SectionLabel>Returned output</SectionLabel><pre className="record">{formatRecord(trial.output)}</pre></div><div className="trial-provenance"><span>{trial.provider || 'provider not recorded'} / {trial.model || 'model not recorded'}</span><span>{trial.completedAt || trial.createdAt || 'timestamp not recorded'}</span></div></div></details> }
function Results({ runId, demo, question }: { runId?: string; demo: DemoPayload; question?: Question }) {
  const [apiRun, setApiRun] = useState<Run | undefined>()
  const [trials, setTrials] = useState<Trial[]>(() => asRun(demo.run)?.id === runId ? asTrials(demo.trials) : [])
  useEffect(() => { if (!runId || runId === 'pending') return; Promise.all([fetch(`/api/runs/${runId}`).then((r) => r.ok ? r.json() : null).catch(() => null), fetch(`/api/runs/${runId}/trials`).then((r) => r.ok ? r.json() : null).catch(() => null)]).then(([runData, trialData]) => { const remote = asRun(runData?.run || runData); if (remote) setApiRun(remote); const remoteTrials = asTrials(trialData?.trials || trialData); if (remoteTrials.length) setTrials(remoteTrials) }) }, [runId])
  useEffect(() => { if (!apiRun && asRun(demo.run)?.id === runId) setTrials(asTrials(demo.trials)) }, [apiRun, demo.run, demo.trials, runId])
  const run = apiRun || (asRun(demo.run)?.id === runId ? asRun(demo.run) : undefined)
  if (!run) return <Pending title="Results dossier" detail="Completed observations and their reproduction artifacts will appear here after a run finishes." />
  const summary = run.summary
  return <section className="detail-page results-page"><Back /><div className="results-head"><div><p className="eyebrow dark"><span className="eyebrow-line" /> {apiRun ? 'EVIDENCE RETURNED' : 'SAVED EVIDENCE SNAPSHOT'}</p><h1>{summary?.headline || 'Results within'}</h1><p className='result-hypothesis'>{summary?.hypothesis || 'A bounded setting with a recorded outcome.'}</p><p>{question?.title || 'The originating question is not attached to this local record.'}</p></div><div className="result-seal"><span>RECORDED STUDY</span><strong>{run.completedTrials} completed trials</strong><small>{run.completedAt ? new Date(run.completedAt).toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'}) : 'Completion not recorded'}</small><details className="run-reference"><summary>Run reference</summary><small>{run.id}</small></details></div></div><div className="result-banner"><span className="result-icon">✦</span><div><span className="mono">PRIMARY OUTCOME</span><strong>{summary?.primaryOutcome || 'Outcome not recorded'}</strong><p>{summary?.conclusion || 'No conclusion is available until actual observations are returned.'}</p></div></div><div className="result-grid"><div><SectionLabel>Condition results</SectionLabel><ResultBars trials={trials} analysis={summary?.analysis} /><PairedResults analysis={summary?.analysis} /><SectionLabel>Recorded observations</SectionLabel>{summary?.observations?.length ? summary.observations.map((o) => <p className="observation" key={o}><span>+</span>{o}</p>) : <div className="pending-card">Observations are pending. This interface does not create results.</div>}<SectionLabel>Uncertainty and limits</SectionLabel><p className="body-copy">{summary?.uncertainty || 'Uncertainty has not been recorded.'}</p>{summary?.limitations?.map((l) => <p className="limit" key={l}><span>↳</span>{l}</p>)}</div><aside><SectionLabel>Reproduction package</SectionLabel><div className="artifact-card"><span className="artifact-icon">{`{ }`}</span><div><strong>Frozen contract and raw evidence</strong><small>Provider settings, trial outputs, measurements, and environment notes.</small></div>{run.artifactUrl ? <a href={run.artifactUrl} target="_blank" rel="noreferrer">Open ↗</a> : <span className="mono">LINK PENDING</span>}</div><a className="reproduce-link" href="https://github.com/RaphaelKhalid/afterlight/blob/main/docs/reproduction.md" target="_blank" rel="noreferrer">Reproduce the analysis</a><OwnerAction mode="publish" runId={run.id} /><SectionLabel>Run accounting</SectionLabel><div className="accounting"><span><small>Trials</small><strong>{run.completedTrials} / {run.totalTrials}</strong></span><span><small>Failed</small><strong>{run.failedTrials}</strong></span><span><small>Spend</small><strong>{formatUsd(run.spentUsd)}</strong></span><span><small>Cost status</small><strong>{run.costStatus}</strong></span></div></aside></div><div className="return-map"><div><span className="mono">EVIDENCE NETWORK</span><h2>Evidence returns to the question.</h2><p>Attaching a run gives the map a new point of evidence. It does not close the broader question.</p></div><button className="primary-action small" onClick={() => question ? go(`/questions/${question.id}`) : go('/atlas')}>Return to dossier ↗</button></div></section>
}

function ResultBars({ trials, analysis }: { trials: Trial[]; analysis?: unknown }) {
  const groups = [...new Set(trials.map((trial) => trial.condition))].map((condition) => trials.filter((trial) => trial.condition === condition))
  if (!groups.length) return <div className="pending-card">Condition results will be plotted after completed trial records return.</div>
  return <div className="result-bars">{groups.map((group) => { const completed = group.filter((trial) => trial.status === 'completed' && typeof trial.score === 'number'); const successes = completed.filter((trial) => (trial.score || 0) > 0.5).length; const rate = completed.length ? successes / completed.length : 0; return <div className="bar-row" key={group[0].condition}><span className="bar-label">{conditionLabel(group[0].condition)}</span><span className="bar-track"><span className="bar-fill" style={{ width: `${rate * 100}%` }} /></span><strong>{completed.length ? `${Math.round(rate * 100)}%` : 'pending'}</strong><small>n={completed.length}</small></div> })}<p className="chart-note">Target-aligned choices among valid completed trials. All 20 planned cases returned a valid choice in each condition. The paired intervals below resample cases, not individual trials.</p></div>
}
function LiveInvestigation({search}:{search:unknown}) {
  const investigation=objectRecord(objectRecord(search).lastInvestigation)
  const sources=Array.isArray(investigation.sources)?investigation.sources.map(objectRecord):[]
  if(!sources.length) return null
  return <details className="live-investigation"><summary>Latest Exa investigation: {sources.length} sources</summary><p>Retrieved {String(investigation.date || '')}. Search results require assessment; they do not establish that a question is solved.</p><ul>{sources.map((source,i)=><li key={String(source.url || i)}><a href={String(source.url)} target="_blank" rel="noreferrer">{String(source.title || source.url)}</a></li>)}</ul></details>
}
function OwnerAction({ mode, questionId, runId, query }: {mode:'investigate'|'publish';questionId?:string;runId?:string;query?:string}) {
  const [token,setToken]=useState(()=>sessionStorage.getItem('afterlight_owner_token')||'')
  const [busy,setBusy]=useState(false), [message,setMessage]=useState('')
  const act=async()=>{ if(!token){setMessage('Enter the owner access key to authorize this action.');return} setBusy(true);setMessage('');sessionStorage.setItem('afterlight_owner_token',token);try {const response=await fetch(mode==='publish'?`/api/runs/${runId}/publish`:`/api/questions/${questionId}/investigate`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(mode==='investigate' && query?{query}:{})});const data=await response.json();if(!response.ok){setMessage(data.error?.message || 'The action could not be completed. Check its saved record before retrying.')}else{const record=data.publication || data.investigation;setMessage(record?.deduplicated?'The existing action was returned. No duplicate was dispatched.':mode==='publish'?'Evidence published to GitHub.':'Investigation saved. Reload the dossier to read the updated source record.')}}catch{setMessage('The response was interrupted. Check the saved record before retrying.')}finally{setBusy(false)}}
  return <details className="owner-actions"><summary>Owner action: {mode==='publish'?'publish evidence':'investigate with Exa'}</summary><p>{mode==='publish'?'Publish this completed run to the configured public repository. Identical exports are deduplicated.':'Search up to ten sources for this question with a $0.10 conservative allowance. An identical query returns its existing record.'}</p><label>Owner access key <span>(this session only)</span><input type="password" value={token} onChange={e=>setToken(e.target.value)} autoComplete="off" /></label><button className="primary-action small" onClick={act} disabled={busy}>{busy?'Recording action...':mode==='publish'?'Publish to GitHub':'Authorize Exa investigation'}</button>{message && <p role="status">{message}</p>}</details>
}
function Pending({ title, detail }: { title: string; detail: string }) { return <section className="pending-page"><Back /><div className="pending-orbit"><span /><span /><span /></div><p className="eyebrow dark"><span className="eyebrow-line" /> AFTERLIGHT / PENDING RECORD</p><h1>{title}<br /><em>is waiting for evidence.</em></h1><p>{detail}</p><button className="primary-action" onClick={() => go('/atlas')}>Return to atlas <span>↗</span></button></section> }

export default App
