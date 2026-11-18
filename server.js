
import express from "express";
import Busboy from "busboy";
import fs from "fs";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import { createRequire } from "module";
import { MongoClient } from "mongodb";
import { pipeline } from "stream/promises";

dotenv.config();

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

const app = express();
const PORT = process.env.PORT || 4000;
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const MAX_FILE_SIZE = 50 * 1024 * 1024;

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Validate environment variables
if (!process.env.MONGODB_URI || !process.env.DB_NAME) {
    throw new Error("MongoDB environment variables are missing");
}

// MongoDB connection
const mongoClient = new MongoClient(process.env.MONGODB_URI);

await mongoClient.connect();

const db = mongoClient.db(process.env.DB_NAME);
const chunksCollection = db.collection("document_chunks");

console.log("MongoDB connected successfully");
console.log("Database:", db.databaseName);
console.log("Collection:", chunksCollection.collectionName);


// 1. Split PDF text into chunks
function splitIntoChunks(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
    const chunks = [];
    const cleanText = text.replace(/\s+/g, " ").trim();
    const step = chunkSize - overlap;

    for (let i = 0; i < cleanText.length; i += step) {
        const chunk = cleanText.slice(i, i + chunkSize).trim();

        if (chunk) chunks.push(chunk);
    }

    return chunks;
}


// 2. Generate vector embedding using Ollama
async function generateEmbedding(text) {
    const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
    const model = process.env.OLLAMA_MODEL || "nomic-embed-text";

    console.log("Generating embedding...");

    const response = await fetch(`${ollamaUrl}/api/embed`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model,
            input: text
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const embedding = data.embeddings?.[0];

    if (!embedding || !Array.isArray(embedding)) {
        throw new Error("Ollama did not return a valid embedding");
    }

    console.log("Embedding generated. Dimensions:", embedding.length);

    return embedding;
}


// 3. Extract PDF, create chunks and store embeddings
async function processPDF(filePath, fileName, originalFileName) {
    console.log("\nSTEP 1: Reading saved PDF");

    const buffer = fs.readFileSync(filePath);

    console.log("PDF buffer size:", buffer.length);

    console.log("\nSTEP 2: Calling PDF parser");

    const parsedData = await pdfParse(buffer);

    console.log("PDF parsing completed");
    console.log("Total pages:", parsedData.numpages);

    const extractedText = parsedData.text || "";

    if (!extractedText.trim()) {
        throw new Error("No readable text found. This PDF may require OCR.");
    }

    console.log("Extracted text length:", extractedText.length);

    console.log("\nSTEP 3: Splitting text into chunks");

    const chunks = splitIntoChunks(extractedText);

    console.log("Total chunks generated:", chunks.length);

    if (chunks.length === 0) {
        throw new Error("No text chunks were generated");
    }

    console.log("\nSTEP 4: Generating embeddings");

    const documents = [];

    for (let i = 0; i < chunks.length; i++) {
        console.log(`Processing chunk ${i + 1}/${chunks.length}`);

        const embedding = await generateEmbedding(chunks[i]);

        documents.push({
            fileName,
            originalFileName,
            chunkIndex: i,
            text: chunks[i],
            embedding,
            createdAt: new Date()
        });
    }

    console.log("\nSTEP 5: Storing documents in MongoDB");

    const result = await chunksCollection.insertMany(documents);

    console.log("MongoDB insertion completed");
    console.log("Inserted documents:", result.insertedCount);

    return {
        totalPages: parsedData.numpages,
        extractedCharacters: extractedText.length,
        totalChunks: chunks.length,
        storedChunks: result.insertedCount
    };
}


// 4. Upload PDF API
app.post("/api/upload", async (req, res) => {
    console.log("\n========== NEW PDF UPLOAD ==========");

    let savedFilePath = null;
    let savedFileName = null;
    let originalFileName = null;
    let fileReceived = false;
    let uploadError = null;
    let writePromise = null;

    let busboy;

    try {
        busboy = Busboy({
            headers: req.headers,
            limits: {
                fileSize: MAX_FILE_SIZE,
                files: 1
            }
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }

    busboy.on("file", (fieldname, file, info) => {
        const { filename, mimeType } = info;

        console.log("File received:", filename);
        console.log("MIME type:", mimeType);

        if (fieldname !== "file") {
            uploadError = new Error("Invalid field name. Expected 'file'.");
            file.resume();
            return;
        }

        if (fileReceived) {
            uploadError = new Error("Only one PDF can be uploaded at a time");
            file.resume();
            return;
        }

        fileReceived = true;
        originalFileName = path.basename(filename || "document.pdf");

        if (
            mimeType !== "application/pdf" ||
            path.extname(originalFileName).toLowerCase() !== ".pdf"
        ) {
            uploadError = new Error("Only PDF files are allowed");
            file.resume();
            return;
        }

        savedFileName = `${Date.now()}-${originalFileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        savedFilePath = path.join(UPLOAD_DIR, savedFileName);

        console.log("Saving PDF to:", savedFilePath);

        file.on("limit", () => {
            uploadError = new Error("PDF exceeds the 50 MB limit");
        });

        writePromise = pipeline(
            file,
            fs.createWriteStream(savedFilePath)
        );
    });

    busboy.on("filesLimit", () => {
        uploadError = new Error("Only one file can be uploaded");
    });

    busboy.on("error", (error) => {
        uploadError = error;
        console.error("Busboy error:", error);
    });

    busboy.on("close", async () => {
        try {
            console.log("Busboy parsing completed");

            if (writePromise) {
                await writePromise;
            }

            if (uploadError) {
                throw uploadError;
            }

            if (!fileReceived || !savedFilePath || !writePromise) {
                return res.status(400).json({
                    success: false,
                    message: "No valid PDF received"
                });
            }

            console.log("PDF saved successfully:", savedFileName);

            const result = await processPDF(
                savedFilePath,
                savedFileName,
                originalFileName
            );

            console.log("\n========== PROCESSING COMPLETED ==========");

            return res.status(200).json({
                success: true,
                message: "PDF uploaded and processed successfully",
                fileName: savedFileName,
                originalFileName,
                totalPages: result.totalPages,
                extractedCharacters: result.extractedCharacters,
                totalChunks: result.totalChunks,
                storedChunks: result.storedChunks
            });

        } catch (error) {
            console.error("\nUPLOAD / PROCESSING ERROR:", error);

            // Keep the saved PDF even if parsing, embedding,
            // or MongoDB insertion fails.
            return res.status(500).json({
                success: false,
                message: error.message || "PDF processing failed",
                fileName: savedFileName
            });
        }
    });

    req.pipe(busboy);
});


// 5. Backend test route
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "PDF RAG backend is running"
    });
});

async function generateAnswer(question, context) {
    const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
    const model = process.env.OLLAMA_CHAT_MODEL || "llama3.2";

    const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model,
            stream: false,
            messages: [
                {
                    role: "system",
                    content: `Answer the user's question using only the provided PDF context.
If the answer is not available in the context, say you cannot find it in the uploaded documents.

PDF Context:
${context}`
                },
                {
                    role: "user",
                    content: question
                }
            ]
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return data.message.content;
}



app.post("/api/chat", async (req, res) => {
    try {
        const { message } = req.body;

        // Validate user question
        if (!message || !message.trim()) {
            return res.status(400).json({
                success: false,
                message: "Please provide a question"
            });
        }

        console.log("\n========== NEW CHAT QUESTION ==========");
        console.log("User question:", message);

        // STEP 1: Generate question embedding
        console.log("\nSTEP 1: Generating question embedding");

        const questionEmbedding = await generateEmbedding(message);

        console.log(
            "Question embedding dimensions:",
            questionEmbedding.length
        );

        // STEP 2: Search relevant PDF chunks
        console.log("\nSTEP 2: Searching relevant PDF chunks");

        const results = await chunksCollection.aggregate([
            {
                $vectorSearch: {
                    index: "vector_index",
                    path: "embedding",
                    queryVector: questionEmbedding,
                    numCandidates: 100,
                    limit: 5
                }
            },
            {
                $project: {
                    _id: 0,
                    fileName: 1,
                    originalFileName: 1,
                    chunkIndex: 1,
                    text: 1,
                    score: {
                        $meta: "vectorSearchScore"
                    }
                }
            }
        ]).toArray();

        // STEP 3: Check retrieved chunks
        if (results.length === 0) {
            console.log("No relevant chunks found");

            return res.json({
                success: true,
                answer: "No relevant information found in your uploaded documents.",
                sources: []
            });
        }

        console.log("\nSTEP 3: Retrieved chunks:", results.length);

        // STEP 4: Combine all retrieved chunks
        console.log("\nSTEP 4: Combining retrieved chunks");

        const context = results.map((chunk, index) => {
            return `
Document: ${chunk.originalFileName}
Chunk Index: ${chunk.chunkIndex}
Relevance Score: ${chunk.score}

Content:
${chunk.text}
`;
        }).join("\n----------------------------\n");

        console.log("Total chunks sent to Ollama:", results.length);

        // STEP 5: Send all chunks to Ollama
        console.log("\nSTEP 5: Sending context to Ollama");

        const ollamaResponse = await fetch(
            `${process.env.OLLAMA_URL || "http://localhost:11434"}/api/chat`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: process.env.OLLAMA_CHAT_MODEL || "llama3.2",
                    stream: false,
                    messages: [
                        {
                            role: "system",
                            content: `
You are an intelligent PDF assistant.

Answer the user's question using the provided PDF document context.

Instructions:
1. Read all the provided chunks carefully.
2. Combine relevant information from different chunks.
3. Give a clear and accurate answer.
4. Do not make up information.
5. If the answer is not available in the context, say so.
6. Keep your answer easy to understand.

PDF DOCUMENT CONTEXT:

${context}
`
                        },
                        {
                            role: "user",
                            content: message
                        }
                    ]
                })
            }
        );

        if (!ollamaResponse.ok) {
            const errorText = await ollamaResponse.text();

            throw new Error(`Ollama error: ${errorText}`);
        }

        const ollamaData = await ollamaResponse.json();

        const answer = ollamaData.message?.content;

        if (!answer) {
            throw new Error("Ollama returned an empty answer");
        }

        // STEP 6: Print generated answer
        console.log("\nSTEP 6: Generated answer");
        console.log(answer);

        // STEP 7: Return answer and sources to React
        return res.json({
            success: true,
            answer,
            sources: results.map(chunk => ({
                fileName: chunk.originalFileName,
                chunkIndex: chunk.chunkIndex,
                score: chunk.score
            }))
        });

    } catch (error) {
        console.error("\nCHAT ERROR:", error);

        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});







// 6. Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
