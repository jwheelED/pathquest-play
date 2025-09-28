"use client"

import { useState } from "react"

export default function ChatBox({ goal }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)

  const sendMessage = async () => {
  if (!input.trim()) return

  const userMessage = { sender: "user", text: input }
  const updatedMessages = [...messages, userMessage]
  setMessages(updatedMessages)
  setInput("")
  setLoading(true)

  // Convert to OpenAI format
  const historyForAI = updatedMessages.map(msg => ({ 
    role: msg.sender === "user" ? "user" : "assistant",
    content: msg.text,
  }))

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: input,
      goal,
      history: historyForAI.slice(0, 10), // send last 10 messages max
    }),
  })

  const data = await res.json()
  setMessages(prev => [...prev, { sender: "ai", text: data.reply }])
  setLoading(false)
}


  return (
    <div className="bg-white p-6 rounded-xl shadow col-span-2">
      <h2 className="text-xl font-semibold mb-2 text-emerald-500">Chat with Edvana</h2>
      <div className="h-64 overflow-y-auto border rounded mb-4 p-2 bg-gray-50 text-sm">
        {messages.map((msg, idx) => (
          <div key={idx} className={`mb-2 ${msg.sender === "user" ? "text-right" : "text-left"}`}>
            <span className={`inline-block px-3 py-2 rounded-lg ${
              msg.sender === "user" ? "bg-blue-100 text-blue-800" : "bg-gray-200 text-gray-800"
            }`}>
              {msg.text}
            </span>
          </div>
        ))}
        {loading && <p className="text-sky-400">Edvana is typing...</p>}
      </div>
      <div className="flex gap-2 text-sky-400">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask a question..."
          className="flex-1 border rounded p-2"
        />
        <button
          onClick={sendMessage}
          className="bg-sky-400 text-white px-4 rounded hover:bg-sky-500"
        >
          Send
        </button>
      </div>
    </div>
  )
}
