import { useEffect, useRef, useState } from 'react'
import SplatViewer from './SplatViewer'
import './App.css'

/* ---------- FastAPI endpoints: change these to match your routes ---------- */
const API_BASE = import.meta.env.VITE_API_URL ?? ''
const UPLOAD_URL = `${API_BASE}/api/v1/jobs/upload` // POST multipart: file, fps, iterations
const jobUrl = (id) => `${API_BASE}/api/v1/jobs/${id}` // GET -> { job_id, status, progress_pct }
const resultUrl = (id) => `${API_BASE}/jobs/${id}/result` // GET -> .ply file
/* -------------------------------------------------------------------------- */

const MAX_MB = 500
const STAGES = [
  { key: 'PENDING', label: 'Queued' },
  { key: 'EXTRACTING', label: 'Extracting frames' },
  { key: 'POSE', label: 'Camera poses' },
  { key: 'TRAINING', label: 'Training splats' },
  { key: 'COMPLETED', label: 'Ready' },
]

// Accepts "Pose_Est", "POSE_ESTIMATION" and so on.
function normalise(status) {
  const s = String(status ?? '').toUpperCase()
  return s.startsWith('POSE') ? 'POSE' : s
}

function uploadVideo(file, { fps, iterations }, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    form.append('fps', fps)
    form.append('iterations', iterations)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', UPLOAD_URL)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onerror = () => reject(new Error('Could not reach the server.'))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText))
        } catch {
          reject(new Error('The server sent an unexpected response.'))
        }
        return
      }
      let message = `Upload failed (${xhr.status}).`
      try {
        const detail = JSON.parse(xhr.responseText).detail
        if (typeof detail === 'string') message = detail
      } catch {
        /* keep default message */
      }
      reject(new Error(message))
    }
    xhr.send(form)
  })
}

function loadRecent() {
  try {
    return JSON.parse(localStorage.getItem('vid2splat.recent') ?? '[]')
  } catch {
    return []
  }
}

export default function App() {
  const [file, setFile] = useState(null)
  const [fps, setFps] = useState(2)
  const [iterations, setIterations] = useState(7000)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [error, setError] = useState('')
  const [jobId, setJobId] = useState(null)
  const [job, setJob] = useState(null)
  const [recent, setRecent] = useState(loadRecent)
  const inputRef = useRef(null)

  const status = normalise(job?.status)
  const stageIndex = STAGES.findIndex((s) => s.key === status)
  const failed = status === 'FAILED'
  const done = status === 'COMPLETED'

  /* Poll job status every 2 seconds until it finishes. */
  useEffect(() => {
    if (!jobId) return
    let stopped = false
    let timer
    const tick = async () => {
      try {
        const res = await fetch(jobUrl(jobId))
        if (!res.ok) throw new Error(`Status check failed (${res.status}).`)
        const data = await res.json()
        if (stopped) return
        setJob(data)
        setError('')
        if (!['COMPLETED', 'FAILED'].includes(normalise(data.status))) {
          timer = setTimeout(tick, 2000)
        }
      } catch (e) {
        if (stopped) return
        setError(e.message)
        timer = setTimeout(tick, 5000)
      }
    }
    tick()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [jobId])

  function pickFile(f) {
    if (!f) return
    const okType = /\.(mp4|mov)$/i.test(f.name)
    if (!okType) return setError('Choose an .mp4 or .mov video.')
    if (f.size > MAX_MB * 1024 * 1024) return setError(`The video must be under ${MAX_MB} MB.`)
    setError('')
    setFile(f)
  }

  async function submit() {
    if (!file || uploading) return
    setUploading(true)
    setUploadPct(0)
    setError('')
    try {
      const data = await uploadVideo(file, { fps, iterations }, setUploadPct)
      const id = data.job_id ?? data.id
      if (!id) throw new Error('The server did not return a job ID.')
      const next = [{ id, name: file.name, at: Date.now() }, ...recent].slice(0, 8)
      setRecent(next)
      localStorage.setItem('vid2splat.recent', JSON.stringify(next))
      setJob(null)
      setJobId(id)
      setFile(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  function openJob(id) {
    setJob(null)
    setError('')
    setJobId(id)
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Vid2Splat</h1>
        <p>Turn a video of an object or room into a 3D model you can orbit in your browser.</p>
      </header>

      <main className="layout">
        <aside className="side">
          <section className="card">
            <h2>New model</h2>

            <div
              className={`drop ${dragging ? 'is-over' : ''} ${file ? 'has-file' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                pickFile(e.dataTransfer.files[0])
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".mp4,.mov,video/mp4,video/quicktime"
                hidden
                onChange={(e) => pickFile(e.target.files[0])}
              />
              {file ? (
                <>
                  <strong className="drop-name">{file.name}</strong>
                  <span>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                  <button className="link" onClick={() => setFile(null)}>
                    Remove
                  </button>
                </>
              ) : (
                <>
                  <strong>Drop a video here</strong>
                  <span>.mp4 or .mov, up to {MAX_MB} MB</span>
                  <button className="btn btn-outline" onClick={() => inputRef.current.click()}>
                    Choose file
                  </button>
                </>
              )}
            </div>

            <div className="field">
              <label htmlFor="fps">
                Frames per second <b>{fps}</b>
              </label>
              <input
                id="fps"
                type="range"
                min="2"
                max="5"
                step="1"
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
              />
              <small>Higher values use more frames and take longer.</small>
            </div>

            <div className="field">
              <span className="label">Training quality</span>
              <div className="seg" role="radiogroup" aria-label="Training quality">
                {[
                  { v: 7000, t: 'Faster', s: '7,000 steps' },
                  { v: 15000, t: 'Sharper', s: '15,000 steps' },
                ].map((o) => (
                  <button
                    key={o.v}
                    role="radio"
                    aria-checked={iterations === o.v}
                    className={iterations === o.v ? 'on' : ''}
                    onClick={() => setIterations(o.v)}
                  >
                    {o.t}
                    <small>{o.s}</small>
                  </button>
                ))}
              </div>
            </div>

            <button className="btn btn-primary wide" disabled={!file || uploading} onClick={submit}>
              {uploading ? `Uploading ${Math.round(uploadPct * 100)}%` : 'Create 3D model'}
            </button>
            {uploading && (
              <div className="meter">
                <span style={{ width: `${uploadPct * 100}%` }} />
              </div>
            )}
          </section>

          <section className="card">
            <h2>Recent models</h2>
            {recent.length === 0 ? (
              <p className="empty">Models you create appear here.</p>
            ) : (
              <ul className="recent">
                {recent.map((r) => (
                  <li key={r.id}>
                    <button className={r.id === jobId ? 'on' : ''} onClick={() => openJob(r.id)}>
                      <span>{r.name}</span>
                      <small>{new Date(r.at).toLocaleString()}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <section className="stage">
          <div className="stage-head">
            <div>
              <h2>{jobId ? 'Your model' : 'Preview'}</h2>
              {jobId && <small className="mono">Job {jobId}</small>}
            </div>
            {/* Placeholder: intentionally does nothing yet */}
            <button className="btn btn-outline" type="button" onClick={() => {}}>
              Share model
            </button>
          </div>

          {jobId && (
            <ol className={`steps ${failed ? 'is-failed' : ''}`} aria-label="Processing progress">
              {STAGES.map((s, i) => (
                <li
                  key={s.key}
                  className={i < stageIndex || done ? 'past' : i === stageIndex ? 'now' : ''}
                >
                  <i />
                  <span>{s.label}</span>
                </li>
              ))}
            </ol>
          )}

          {error && (
            <p className="banner" role="alert">
              {error}
            </p>
          )}

          <div className="canvas-wrap">
            {done ? (
              <SplatViewer key={jobId} url={resultUrl(jobId)} fileName={`${jobId}.ply`} />
            ) : (
              <div className="placeholder">
                {failed ? (
                  <>
                    <h3>This job failed</h3>
                    <p>
                      The video may have too few sharp frames or too little camera movement. Try
                      filming again while moving around the subject.
                    </p>
                  </>
                ) : jobId ? (
                  <>
                    <h3>{STAGES[stageIndex]?.label ?? 'Starting'}</h3>
                    <div className="meter big">
                      <span style={{ width: `${job?.progress_pct ?? 0}%` }} />
                    </div>
                    <p>{job?.progress_pct ?? 0}% complete. You can leave this page open while it runs.</p>
                  </>
                ) : (
                  <>
                    <h3>No model yet</h3>
                    <p>Upload a video and your 3D model will open here when it is ready.</p>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
