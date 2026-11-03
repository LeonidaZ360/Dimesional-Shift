import { useEffect, useRef, useState } from 'react'
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d'

// Renders one trained splat model. `url` must serve the .ply file.
export default function SplatViewer({ url, fileName = 'model.ply' }) {
  const rootRef = useRef(null)
  const [flipped, setFlipped] = useState(false) // Nerfstudio exports often load upside down
  const [reloadKey, setReloadKey] = useState(0) // bump to reset the camera or retry
  const [status, setStatus] = useState('loading')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setProgress(0)

    const viewer = new GaussianSplats3D.Viewer({
      rootElement: rootRef.current,
    
      // Correct world orientation
      cameraUp: [0, 1, 0],
    
      // Camera starts in front of the model
      initialCameraPosition: [0, 0, 3],
      initialCameraLookAt: [0, 0, 0],
    
      sharedMemoryForWorkers: false,
    })

    viewer
      .addSplatScene(url, {
        // The result URL has no file extension, so the format must be given explicitly.
        format: GaussianSplats3D.SceneFormat.Ply,
        progressiveLoad: false, // progressive loading only works with .splat files
        showLoadingUI: false,
        onProgress: (pct) => !cancelled && setProgress(Math.round(pct)),
      })
      .then(() => {
        if (cancelled) return
        viewer.start()
        setStatus('ready')
      })
      .catch(() => !cancelled && setStatus('error'))

    return () => {
      cancelled = true
      try {
        Promise.resolve(viewer.dispose()).catch(() => {})
      } catch {
        /* viewer was disposed before it finished loading */
      }
    }
  }, [url, flipped, reloadKey])

  return (
    <div className="viewer">
      <div ref={rootRef} className="viewer-canvas" />

      {status === 'loading' && (
        <div className="viewer-overlay" role="status">
          <div className="meter">
            <span style={{ width: `${progress}%` }} />
          </div>
          <p>Loading model, {progress}%</p>
        </div>
      )}

      {status === 'error' && (
        <div className="viewer-overlay" role="alert">
          <p>The model could not be loaded.</p>
          <button className="btn btn-light" onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </button>
        </div>
      )}

      <div className="viewer-tools">
        <button className="btn btn-light" onClick={() => setFlipped((f) => !f)}>
          Flip upright
        </button>
        <button className="btn btn-light" onClick={() => setReloadKey((k) => k + 1)}>
          Reset view
        </button>
        <a className="btn btn-light" href={url} download={fileName}>
          Download .ply
        </a>
      </div>
    </div>
  )
}
