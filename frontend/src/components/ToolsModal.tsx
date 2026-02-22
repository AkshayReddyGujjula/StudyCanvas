import { useState } from 'react'
import { useCanvasStore } from '../store/canvasStore'

export default function ToolsModal({ onClose }: { onClose: () => void }) {
    const userDetails = useCanvasStore(s => s.userDetails)
    const setUserDetails = useCanvasStore(s => s.setUserDetails)

    const [name, setName] = useState(userDetails.name)
    const [age, setAge] = useState(userDetails.age)
    const [status, setStatus] = useState(userDetails.status)
    const [educationLevel, setEducationLevel] = useState(userDetails.educationLevel)

    const handleSave = () => {
        setUserDetails({ name, age, status, educationLevel })
        onClose()
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h3 className="text-lg font-semibold text-gray-800">User Context Tools</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
                <div className="p-6 flex flex-col gap-4">
                    <p className="text-sm text-gray-600 mb-2">
                        Enter your details below. These are passed into every query to improve responses.
                    </p>

                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">Name</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={name} onChange={e => setName(e.target.value)}
                            placeholder="e.g. John Doe"
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">Age</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={age} onChange={e => setAge(e.target.value)}
                            placeholder="e.g. 20"
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">Status</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={status} onChange={e => setStatus(e.target.value)}
                            placeholder="e.g. Preparing for exams"
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">Education Level</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={educationLevel} onChange={e => setEducationLevel(e.target.value)}
                            placeholder="e.g. University Undergraduate"
                        />
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                    >
                        Save Details
                    </button>
                </div>
            </div>
        </div>
    )
}
