# Add a New Node Type to StudyCanvas

Use this skill when the user asks you to add a new type of node to the React Flow canvas.

Every node type requires changes in **exactly 3 locations**. Missing any one of them causes silent failures (ReactFlow falls back to a default node with no error).

---

## Step 0: Plan Before Writing

Before writing any code, decide:
- **Node name**: e.g. `citationNode` → type key `citationNode`, interface `CitationNodeData`, component `CitationNode.tsx`
- **Node purpose**: What data does it hold? What does the user do with it?
- **How it gets created**: From toolbar button, from AI output, from right-click menu?
- **Color in graph**: Which palette color represents it? (see CLAUDE.md for palette)
- **Edges**: Does it connect to other nodes? What are its handles?

---

## Step 1: Define the Data Interface

**File**: `frontend/src/types/index.ts`

Add your interface at the bottom of the existing interface section. Follow the pattern of similar nodes:

```typescript
export interface CitationNodeData {
    // Required: every node should have these
    isLoading: boolean
    isMinimized?: boolean
    isExpanding?: boolean
    isPinned?: boolean
    /** Which PDF page (1-based) this node belongs to */
    pageIndex?: number

    // Your node-specific fields
    citationText: string
    sourceTitle: string
    pageNumber?: number
}
```

**Rules**:
- Use `import type` when importing this interface elsewhere
- Optional fields get `?`
- Status-tracking nodes should include `status: NodeStatus`
- Nodes with AI content should include `isLoading: boolean` and `isStreaming?: boolean`

---

## Step 2: Create the Component

**File**: `frontend/src/components/CitationNode.tsx`

```typescript
import { memo } from 'react'
import { type NodeProps, Handle, Position } from '@xyflow/react'
import type { CitationNodeData } from '@/types'

const CitationNode = memo(({ id, data }: NodeProps) => {
    const nodeData = data as unknown as CitationNodeData

    // Get store actions — only what this component needs
    const updateNodeData = useCanvasStore(s => s.updateNodeData)

    return (
        <div className="bg-white border-2 border-primary-500 rounded-lg p-4 min-w-[280px] max-w-[400px]">
            {/* Handles for edge connections */}
            <Handle type="target" position={Position.Left} id="left" />
            <Handle type="source" position={Position.Right} id="right" />

            {/* Node content */}
            <div className="text-sm text-primary-800">
                {nodeData.citationText}
            </div>
        </div>
    )
})

CitationNode.displayName = 'CitationNode'
export default CitationNode
```

**Rules**:
- Always wrap with `React.memo` — canvas performance depends on this
- Always set `displayName` for React DevTools
- Import from `@/types` (path alias, not relative)
- Use `data as unknown as YourNodeData` — ReactFlow types `data` as `Record<string, unknown>`
- Use `useCallback` for any handler passed as a prop to children
- Use Tailwind classes from the palette (primary, secondary, accent, success, neutral)

---

## Step 3: Register the Node Type

**File**: `frontend/src/components/Canvas.tsx`

### 3a. Import the component (top of file, with other imports)
```typescript
import CitationNode from './CitationNode'
```

### 3b. Add to NODE_TYPES object (~line 90)
```typescript
const NODE_TYPES = {
    contentNode: ContentNode,
    answerNode: AnswerNode,
    // ... existing types ...
    citationNode: CitationNode,   // ADD THIS
}
```

### 3c. Add a color case to `computeNodeColor()` (~line 55)
```typescript
function computeNodeColor(node: Node): string {
    switch (node.type) {
        // ... existing cases ...
        case 'citationNode':
            return '#1E3A5F'  // use primary, secondary, or accent hex
        default:
            return DEFAULT_EDGE_COLOR
    }
}
```

---

## Step 4: Add Node Creation Logic

Decide how the node gets created and add it to the right place:

### If created from LeftToolbar (user-initiated)
**File**: `frontend/src/components/LeftToolbar.tsx`

Add a button and in `Canvas.tsx` handle the creation:
```typescript
const handleAddCitationNode = useCallback(() => {
    const position = findNonOverlappingPosition(nodes, { x: 400, y: 200 }, 300, 200)
    const newNode: Node = {
        id: crypto.randomUUID(),
        type: 'citationNode',
        position,
        data: {
            citationText: '',
            sourceTitle: '',
            isLoading: false,
        } satisfies CitationNodeData,
    }
    setNodes(prev => [...prev, newNode])
    persistToLocalStorage()
}, [nodes, setNodes, persistToLocalStorage])
```

### If created as a child of another node (AI-generated)
Use `getNewNodePosition(parentNode, allNodes, allEdges)` from `@/utils/positioning` to calculate position.

---

## Step 5: TypeScript Check

```bash
cd frontend && npm run build
```

Fix any errors. Common issues:
- Missing `import type` for type-only imports
- `data as unknown as YourType` missing — don't cast `data` directly
- Unused parameters (tsconfig enforces `noUnusedParameters`)

---

## Complete Checklist

- [ ] Interface added to `frontend/src/types/index.ts`
- [ ] Component created at `frontend/src/components/YourNode.tsx` (memo wrapped)
- [ ] Imported in `Canvas.tsx`
- [ ] Added to `NODE_TYPES` in `Canvas.tsx`
- [ ] Color case added to `computeNodeColor()` in `Canvas.tsx`
- [ ] Creation logic wired up (toolbar button, AI output handler, etc.)
- [ ] `npm run build` passes with no errors
- [ ] `npm run lint` passes with no warnings
