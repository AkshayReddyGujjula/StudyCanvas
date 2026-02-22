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
  const setUserDetails = useCanvasStore((s) => s.setUserDetails)

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
        if (state.edges) {
          // Migrate old edges that used the non-existent 'right-target' handle id.
          // That handle was never defined on AnswerNode — the correct id is 'right'.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const migratedEdges = (state.edges as any[]).map((e: any) =>
            e.targetHandle === 'right-target' ? { ...e, targetHandle: 'right' } : e
          )
          setEdges(migratedEdges)
        }
        // setFileData resets currentPage to 1 and recalculates pageMarkdowns —
        // we override currentPage afterwards with the persisted value.
        if (state.fileData) setFileData(state.fileData)
        if (state.userDetails) setUserDetails(state.userDetails)
        // highlights are already in store default [] — restore them
        // note: activeAbortController is always null on load (transient field)
        if (state.highlights && state.highlights.length > 0) {
          // re-hydrate highlights
          const store = useCanvasStore.getState()
          state.highlights.forEach((h: { id: string; text: string; nodeId: string }) =>
            store.addHighlight(h)
          )
        }
        // Restore saved page — must come AFTER setFileData (which resets to page 1)
        if (typeof state.currentPage === 'number' && state.currentPage > 1) {
          useCanvasStore.getState().setCurrentPage(state.currentPage)
        }
        if (state.nodes && state.nodes.length > 0) {
          setHasCanvas(true)
        }
      } catch (e) {
        console.error('Failed to restore canvas from localStorage', e)
      }
    }
    setInitialized(true)
  }, [setNodes, setEdges, setFileData, setUserDetails])

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
