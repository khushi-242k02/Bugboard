import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchBugs, PRIORITIES, STATUSES } from './api/bugs'
import './App.css'

// How often to re-fetch the sheet while the page is visible.
const POLL_INTERVAL_MS = 15000

const toClass = (value) => value.toLowerCase().replace(/\s+/g, '-')

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function Badge({ kind, value }) {
  return <span className={`badge ${kind}-${toClass(value)}`}>{value}</span>
}

function BugDetail({ bug, onClose }) {
  return (
    <aside className="detail">
      <div className="detail-header">
        <span className="bug-id">{bug.id}</span>
        <button className="close" onClick={onClose} aria-label="Close details">×</button>
      </div>
      <h2>{bug.title}</h2>
      <dl>
        <dt>Priority</dt>
        <dd><Badge kind="priority" value={bug.priority} /></dd>
        <dt>Status</dt>
        <dd><Badge kind="status" value={bug.status} /></dd>
        <dt>Assigned to</dt>
        <dd>{bug.assigned_to || <span className="muted">Unassigned</span>}</dd>
        <dt>Reported by</dt>
        <dd>{bug.reported_by || '—'}</dd>
        <dt>Closed date</dt>
        <dd>{formatDate(bug.closed_date)}</dd>
      </dl>
    </aside>
  )
}

function App() {
  const [bugs, setBugs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [priority, setPriority] = useState('All')
  const [selectedId, setSelectedId] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  const loadBugs = useCallback(async () => {
    setRefreshing(true)
    try {
      setBugs(await fetchBugs())
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Load once, then re-fetch on an interval while the page is visible,
  // and immediately whenever the user comes back to this tab.
  useEffect(() => {
    loadBugs()

    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') loadBugs()
    }, POLL_INTERVAL_MS)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadBugs()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [loadBugs])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return bugs.filter((bug) => {
      if (status !== 'All' && bug.status !== status) return false
      if (priority !== 'All' && bug.priority !== priority) return false
      if (!query) return true
      return [bug.id, bug.title, bug.assigned_to, bug.reported_by]
        .some((field) => field?.toLowerCase().includes(query))
    })
  }, [bugs, search, status, priority])

  const counts = useMemo(() => ({
    total: bugs.length,
    open: bugs.filter((b) => b.status === 'Open').length,
    inProgress: bugs.filter((b) => b.status === 'In Progress').length,
    closed: bugs.filter((b) => b.status === 'Closed' || b.status === 'Resolved').length,
  }), [bugs])

  const selected = bugs.find((bug) => bug.id === selectedId)

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>BugBoard</h1>
          <p className="muted">Track and review reported bugs</p>
        </div>
        <div className="sync">
          {lastUpdated && (
            <span className="muted">Updated {lastUpdated.toLocaleTimeString()}</span>
          )}
          <button className="refresh" onClick={loadBugs} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <section className="stats">
        <div className="stat"><span>Total</span><strong>{counts.total}</strong></div>
        <div className="stat"><span>Open</span><strong>{counts.open}</strong></div>
        <div className="stat"><span>In progress</span><strong>{counts.inProgress}</strong></div>
        <div className="stat"><span>Closed / resolved</span><strong>{counts.closed}</strong></div>
      </section>

      <section className="filters">
        <input
          type="search"
          placeholder="Search by ID, title or person…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="All">All statuses</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="All">All priorities</option>
          {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </select>
      </section>

      <main className={`content ${selected ? 'with-detail' : ''}`}>
        <div className="table-wrap">
          {loading && <p className="state">Loading bugs…</p>}
          {error && <p className="state error">Could not load bugs: {error}</p>}
          {!loading && !error && filtered.length === 0 && (
            <p className="state">No bugs match your filters.</p>
          )}
          {!loading && !error && filtered.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Assigned to</th>
                  <th>Reported by</th>
                  <th>Closed date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((bug) => (
                  <tr
                    key={bug.id}
                    className={bug.id === selectedId ? 'selected' : ''}
                    onClick={() => setSelectedId(bug.id)}
                  >
                    <td className="bug-id">{bug.id}</td>
                    <td className="title">{bug.title}</td>
                    <td><Badge kind="priority" value={bug.priority} /></td>
                    <td><Badge kind="status" value={bug.status} /></td>
                    <td>{bug.assigned_to || <span className="muted">Unassigned</span>}</td>
                    <td>{bug.reported_by}</td>
                    <td>{formatDate(bug.closed_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && <BugDetail bug={selected} onClose={() => setSelectedId(null)} />}
      </main>
    </div>
  )
}

export default App
