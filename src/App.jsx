
import React, { useMemo, useRef, useState } from "react";
import {
  Bot, Sun, Moon, FileText, Database, CheckCircle2, Zap,
  UploadCloud, Folder, Search, Eye, MoreVertical, ArrowRight,
  Trash2, Paperclip, Send, Sparkles, Link2, File as FileIcon,
  ChevronDown, Check
} from "lucide-react";
import axios from "axios";

const API_URL = "http://localhost:4000";

const initialDocs = [
  { name: "RAG_Implementation_Guide.pdf", size: "12.5 MB", date: "Nov 4, 2026", status: "Processed" },
  { name: "AI_Best_Practices.pdf", size: "8.7 MB", date: "Nov 3, 2026", status: "Processed" },
  { name: "System_Architecture.pdf", size: "15.2 MB", date: "Nov 1, 2026", status: "Processed" },
  { name: "User_Manual.pdf", size: "6.1 MB", date: "Oct 28, 2026", status: "Processed" },
  { name: "Technical_Documentation.pdf", size: "11.8 MB", date: "Oct 25, 2026", status: "Processed" }
];

function App() {
  const [docs, setDocs] = useState(initialDocs);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [dark, setDark] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [chat, setChat] = useState([
    {
      role: "user",
      text: "What is RAG and how does it work?",
      time: "09:45 AM"
    },
    {
      role: "assistant",
      text: "RAG (Retrieval-Augmented Generation) is a technique that combines information retrieval with large language models.",
      steps: [
        "Retrieve: Find relevant information from your documents.",
        "Augment: Add the retrieved context to your question.",
        "Generate: Use the LLM to provide an answer based on your documents."
      ],
      extra: "This helps reduce hallucinations and ensures answers are based on your specific content.",
      sources: [
        { fileName: "RAG_Implementation_Guide.pdf", chunkIndex: 12 },
        { fileName: "AI_Best_Practices.pdf", chunkIndex: 8 }
      ]
    }
  ]);

  const fileRef = useRef(null);

  const filtered = useMemo(
    () => docs.filter(doc => doc.name.toLowerCase().includes(query.toLowerCase())),
    [docs, query]
  );

  const visibleDocs = showAll ? filtered : filtered.slice(0, 5);

  const totalSize = docs
    .reduce((sum, doc) => sum + (parseFloat(doc.size) || 0), 0)
    .toFixed(1);

  const processedCount = docs.filter(
    doc => doc.status === "Processed"
  ).length;

  // Upload PDF files
  const uploadFiles = async (files) => {
    for (const file of Array.from(files || [])) {
      if (
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
      ) {
        alert(`${file.name} is not a PDF file`);
        continue;
      }

      const fileId = crypto.randomUUID();

      setDocs(old => [
        {
          id: fileId,
          name: file.name,
          size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
          date: "Just now",
          status: "Processing, please wait..."
        },
        ...old
      ]);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await axios.post(
          `${API_URL}/api/upload`,
          formData
        );

        console.log("Upload successful:", response.data);

        setDocs(old =>
          old.map(doc =>
            doc.id === fileId
              ? { ...doc, status: "Processed" }
              : doc
          )
        );
      } catch (error) {
        console.error(
          "Upload failed:",
          error.response?.data || error.message
        );

        setDocs(old =>
          old.map(doc =>
            doc.id === fileId
              ? { ...doc, status: "Failed" }
              : doc
          )
        );
      }
    }
  };

  // Drag and drop
  const handleDrop = (e) => {
    e.preventDefault();
    uploadFiles(e.dataTransfer.files);
  };

  // Send chat message
  const send = async (suggestedMessage) => {
    const clean = (suggestedMessage || message).trim();

    if (!clean) return;

    // Display user's message immediately
    setChat(prev => [
      ...prev,
      {
        role: "user",
        text: clean,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        })
      }
    ]);

    setMessage("");

    try {
      const response = await axios.post(
        `${API_URL}/api/chat`,
        { message: clean }
      );

      // Display Ollama's answer
      setChat(prev => [
        ...prev,
        {
          role: "assistant",
          text: response.data.answer,
          sources: response.data.sources || []
        }
      ]);

    } catch (error) {
      console.error(
        "Chat error:",
        error.response?.data || error.message
      );

      setChat(prev => [
        ...prev,
        {
          role: "assistant",
          text: "Failed to get a response. Please try again."
        }
      ]);
    }
  };

  // Remove document from UI
  const removeDoc = (fileId, index) => {
    setDocs(old =>
      old.filter((doc, i) =>
        doc.id ? doc.id !== fileId : i !== index
      )
    );
  };

  return (
    <main className={dark ? "app dark" : "app"}>

      {/* HEADER */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <Bot size={42} strokeWidth={2.4} />
          </div>
          <div>
            <h1>RAG PDF Assistant</h1>
            <p>Ask anything from your PDF documents using the power of RAG</p>
          </div>
        </div>

        <div className="profile-actions">
          <button
            className="icon-button theme-toggle"
            onClick={() => setDark(!dark)}
            aria-label="Toggle theme"
          >
            {dark ? <Sun /> : <Moon />}
          </button>

          <button className="profile">
            <span className="avatar">AC</span>
            <b>Arka Chakraborty</b>
            <ChevronDown size={15} />
          </button>
        </div>
      </header>

      {/* STATISTICS */}
      <section className="stats-grid">
        <Stat
          icon={<FileText />}
          label="Total PDFs"
          value={docs.length}
          tone="purple"
        />

        <Stat
          icon={<Database />}
          label="Total Size"
          value={`${totalSize} MB`}
          tone="green"
        />

        <Stat
          icon={<CheckCircle2 />}
          label="Processed"
          value={`${processedCount} / ${docs.length}`}
          tone="blue"
        />

        <div className="stat-card ready-card">
          <div className="stat-icon orange">
            <Zap />
          </div>
          <div>
            <span>Ready to Ask</span>
            <strong className="ready-text">
              Your knowledge base is ready!
            </strong>
          </div>
          <CheckCircle2 className="ready-check" />
        </div>
      </section>

      {/* WORKSPACE */}
      <section className="workspace">
        <aside className="left-column">

          {/* UPLOAD */}
          <div className="upload-card">
            <div
              className="dropzone"
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
            >
              <UploadCloud size={54} strokeWidth={1.8} />
              <h2>Upload PDF Files</h2>
              <p>Drag &amp; drop your PDFs here or click to browse</p>

              <button
                type="button"
                className="primary choose-btn"
                onClick={() => fileRef.current?.click()}
              >
                <Folder size={19} />
                Choose Files
              </button>

              <input
                type="file"
                ref={fileRef}
                accept=".pdf,application/pdf"
                multiple
                hidden
                onChange={e => {
                  uploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />

              <small>Supports large files • Up to 500MB per file</small>
            </div>
          </div>

          {/* DOCUMENTS */}
          <div className="documents-card">
            <div className="documents-heading">
              <h2>
                <Folder size={23} fill="currentColor" />
                Your Documents
              </h2>

              <label className="search-box">
                <Search size={18} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search files..."
                />
              </label>
            </div>

            <div className="document-list">
              {visibleDocs.map((doc, i) => (
                <div
                  className="document-row"
                  key={doc.id || `${doc.name}-${i}`}
                >
                  <div className="pdf-icon">
                    <FileText size={20} />
                    <span>PDF</span>
                  </div>

                  <div className="doc-info">
                    <b title={doc.name}>{doc.name}</b>
                    <small>
                      {doc.size}<i> • </i>{doc.date}
                    </small>
                  </div>

                  <span
                    className={`status ${
                      doc.status === "Failed"
                        ? "failed"
                        : doc.status === "Processed"
                          ? "processed"
                          : "processing"
                    }`}
                  >
                    {doc.status}
                  </span>

                  <button
                    className="row-action"
                    title="Preview"
                    disabled={doc.status !== "Processed"}
                  >
                    <Eye size={18} />
                  </button>

                  <button
                    className="row-action"
                    title="Remove document"
                    onClick={() =>
                      removeDoc(doc.id, docs.indexOf(doc))
                    }
                  >
                    <MoreVertical size={19} />
                  </button>
                </div>
              ))}

              {!visibleDocs.length && (
                <div className="empty-docs">
                  No matching PDF files found.
                </div>
              )}
            </div>

            <button
              className="view-all"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? "Show Less" : "View All Documents"}
              <ArrowRight size={18} />
            </button>
          </div>
        </aside>

        {/* CHAT */}
        <section className="chat-card">
          <div className="chat-header">
            <div className="assistant-identity">
              <div className="assistant-logo">
                <Bot size={34} />
              </div>
              <div>
                <h2>RAG Assistant</h2>
                <p>Ask questions, get accurate answers from your PDFs</p>
              </div>
            </div>

            <button
              className="clear-btn"
              onClick={() => setChat([])}
            >
              <Trash2 size={17} />
              Clear Chat
            </button>
          </div>

          <div className="messages">
            {chat.length === 0 && (
              <div className="welcome">
                <div className="assistant-logo">
                  <Bot size={34} />
                </div>
                <h3>Your PDF assistant is ready</h3>
                <p>
                  Ask a question or choose one of the suggestions below.
                </p>
              </div>
            )}

            {chat.map((item, i) =>
              item.role === "user" ? (
                <div className="user-message-wrap" key={i}>
                  <div className="user-message">
                    {item.text}
                    <small>
                      {item.time || "Just now"}
                      <Check size={13} />
                    </small>
                  </div>
                  <span className="user-avatar">AC</span>
                </div>
              ) : (
                <div className="assistant-message-wrap" key={i}>
                  <div className="bot-small">
                    <Bot size={22} />
                  </div>

                  <article className="assistant-message">
                    <p>{item.text}</p>

                    {item.steps && (
                      <ol>
                        {item.steps.map((s, j) => {
                          const [lead, ...rest] = s.split(":");

                          return (
                            <li key={j}>
                              <span>{j + 1}</span>
                              <div>
                                <b>{lead}:</b>
                                {rest.join(":")}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}

                    {item.extra && (
                      <p className="extra">{item.extra}</p>
                    )}

                    {item.sources?.length > 0 && (
                      <div className="sources">
                        <div className="sources-title">
                          <span>
                            <Link2 size={17} />
                            Sources ({item.sources.length})
                          </span>

                          <button
                            onClick={e =>
                              e.currentTarget
                                .closest(".sources")
                                .classList.toggle("collapsed")
                            }
                          >
                            Show all
                          </button>
                        </div>

                        <div className="source-items">
                          {item.sources.map((s, j) => (
                            <div key={j}>
                              <FileIcon size={18} />
                              {typeof s === "string"
                                ? s
                                : `${s.fileName} — Chunk ${s.chunkIndex}`}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                </div>
              )
            )}
          </div>

          {/* CHAT INPUT */}
          <div className="composer-area">
            <form
              className="composer"
              onSubmit={e => {
                e.preventDefault();
                send();
              }}
            >
              <button
                type="button"
                className="attach-btn"
                title="Attach PDF"
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip size={22} />
              </button>

              <input
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Ask a question about your documents..."
              />

              <button
                className="send-btn"
                type="submit"
                aria-label="Send message"
              >
                <Send size={21} />
              </button>
            </form>

            <div className="suggestions">
              {[
                "Summarize this document",
                "What are the key points?",
                "Find technical details"
              ].map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                >
                  <Sparkles size={15} />
                  {s}
                </button>
              ))}
            </div>
          </div>
        </section>
      </section>

      <footer>
        RAG PDF Assistant <span>•</span> UI prototype
      </footer>
    </main>
  );
}

function Stat({ icon, label, value, tone }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className={`wave ${tone}`}></div>
    </div>
  );
}

export default App;
