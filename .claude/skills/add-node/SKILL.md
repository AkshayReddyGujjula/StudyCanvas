---
name: add-node
description: Scaffold a new React Flow canvas node type for StudyCanvas. Use when the user wants to add a new kind of node to the canvas (e.g., a countdown node, a to-do list node, a link node, etc.).
context: fork
---

The user wants to add a new canvas node type to StudyCanvas.

## Steps

1. **Identify the node name and purpose** from the user's request.

2. **Read existing node for reference** — read `frontend/src/components/StickyNoteNode.tsx` (simple) or `frontend/src/components/AnswerNode.tsx` (complex with AI) to understand the pattern.

3. **Read types** — read `frontend/src/types/index.ts` to see existing node data type definitions.

4. **Read Canvas.tsx nodeTypes** — grep for `nodeTypes` in `frontend/src/components/Canvas.tsx` to find where node types are registered.

5. **Read LeftToolbar.tsx** — read `frontend/src/components/LeftToolbar.tsx` to understand how toolbar buttons add nodes.

6. **Create the node component** at `frontend/src/components/<Name>Node.tsx`:
   - Import `NodeProps` from `@xyflow/react`
   - Accept typed `data` prop using an interface
   - Wrap with `memo()` from React
   - Use Tailwind CSS for all styling
   - Include a drag handle (`data-drag-handle` or use `nodeDrag` from ReactFlow)
   - Handle the `selected` state visually if needed

7. **Add the type definition** to `frontend/src/types/index.ts`:
   - Define a `<Name>NodeData` interface
   - Add it to the union type if one exists

8. **Register in Canvas.tsx**:
   - Import the new component
   - Add it to the `nodeTypes` object: `<name>: <Name>Node`

9. **Add to LeftToolbar.tsx** (if user-insertable):
   - Add a button with an appropriate icon
   - On click, call `addNode()` with the new node type and default data
   - Use consistent button styling with other toolbar items

10. **Verify** by checking that all imports resolve and the node type string matches exactly between registration and usage.

## Key constraints
- Node component files must be in `frontend/src/components/`
- Node type key in `nodeTypes` must exactly match the `type` field used when creating nodes
- Default node data must match the interface defined in `types/index.ts`
- Use `useReactFlow().setNodes()` or Zustand `canvasStore` to update node data from within the node
- Memoize the component and any event handlers to avoid unnecessary React Flow re-renders
