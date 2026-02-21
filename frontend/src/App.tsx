import { useState, useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import Canvas from './components/Canvas'
import UploadPanel from './components/UploadPanel'
import { useCanvasStore, STORAGE_KEY } from './store/canvasStore'
import './index.css'


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
      {hasCanvas ? (
        <ReactFlowProvider>
          <Canvas onReset={handleReset} />
        </ReactFlowProvider>
      ) : (
        <UploadPanel onUploaded={handleUploaded} />
      )}
    </>
  )
}
