import { useState, useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import Canvas from './components/Canvas'
import UploadPanel from './components/UploadPanel'
import { useCanvasStore, STORAGE_KEY } from './store/canvasStore'
import './index.css'

// Inline styles needed for Tailwind's fade-in animation not available by default
const fadeInStyle = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`

export default function App() {
  const setNodes = useCanvasStore((s) => s.setNodes)
  const setEdges = useCanvasStore((s) => s.setEdges)
  const setFileData = useCanvasStore((s) => s.setFileData)
  const resetCanvas = useCanvasStore((s) => s.resetCanvas)

  // Determine initial state: has canvas or needs upload
  const [hasCanvas, setHasCanvas] = useState(false)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    // On mount: check localStorage
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const state = JSON.parse(saved)
        if (state.nodes) setNodes(state.nodes)
        if (state.edges) setEdges(state.edges)
        if (state.fileData) setFileData(state.fileData)
        // highlights are already in store default [] — restore them
        // note: activeAbortController is always null on load (transient field)
        if (state.highlights && state.highlights.length > 0) {
          // re-hydrate highlights
          const store = useCanvasStore.getState()
          state.highlights.forEach((h: { id: string; text: string; nodeId: string }) =>
            store.addHighlight(h)
          )
        }
        if (state.nodes && state.nodes.length > 0) {
          setHasCanvas(true)
        }
      } catch (e) {
        console.error('Failed to restore canvas from localStorage', e)
      }
    }
    setInitialized(true)
  }, [setNodes, setEdges, setFileData])

  const handleUploaded = () => setHasCanvas(true)

  const handleReset = () => {
    resetCanvas()
    setHasCanvas(false)
  }

  if (!initialized) return null

  return (
    <>
      <style>{fadeInStyle}</style>
      {hasCanvas ? (
        <ReactFlowProvider>
          {/* Upload new PDF button — always visible when canvas is shown */}
          <div className="fixed top-4 left-4 z-40">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-2 bg-white text-gray-700 text-sm font-medium
                         rounded-lg shadow-md border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              ↩ Upload new PDF
            </button>
          </div>
          <Canvas />
        </ReactFlowProvider>
      ) : (
        <UploadPanel onUploaded={handleUploaded} />
      )}
    </>
  )
}
