const { generateWithFallback, getEmbeddingModel } = require('../config/gemini');
const Resource = require('../models/Resource.model');
const fs = require('fs');
const zlib = require('zlib');

const LOCAL_FALLBACK_MODEL = 'local-fallback';

const isAIServiceError = (err) => err?.isAIError || err?.status === 503;

const compactWhitespace = (text = '') => text.replace(/\s+/g, ' ').trim();

const normalizeHistory = (conversationHistory = []) => (
  Array.isArray(conversationHistory)
    ? conversationHistory
      .filter((msg) => msg && (msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string')
      .slice(-6)
    : []
);

const splitSentences = (text = '') => compactWhitespace(text)
  .split(/(?<=[.!?])\s+/)
  .map((sentence) => sentence.trim())
  .filter((sentence) => sentence.length > 25);

const pickRelevantSentences = (content, question = '', limit = 5) => {
  const sentences = splitSentences(content);
  if (sentences.length === 0) return [];

  const terms = question.toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((term) => term.length > 3);

  const scored = sentences.map((sentence, index) => {
    const lower = sentence.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
    return { sentence, score, index };
  });

  const best = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);

  return (best.length ? best : scored.slice(0, limit)).map((item) => item.sentence);
};

const createLocalSummary = (resource, content) => {
  if (!content) {
    const tags = resource.tags?.length ? resource.tags.join(', ') : 'no tags';
    return `## Summary
I could not read the full file content, so this fallback summary is based on metadata only.

## Key Points
- Title: ${resource.title}
- File type: ${resource.fileType || 'unknown'}
- Tags: ${tags}

## Quick Takeaway
This resource is available in the workspace, but its content needs a readable text format or the AI provider to be available for a deeper summary.`;
  }

  const sentences = splitSentences(content).slice(0, 8);
  const preview = sentences.length
    ? sentences.map((sentence) => `- ${sentence}`).join('\n')
    : `- ${compactWhitespace(content).slice(0, 700)}`;

  return `## Summary
Gemini is temporarily unavailable, so I created an extractive summary from the readable file text.

## Key Points
${preview}

## Quick Takeaway
The resource "${resource.title}" contains readable text and can still be reviewed while the AI provider recovers.`;
};

const createLocalResourceAnswer = (question, resource, content) => {
  if (!content) {
    return `Gemini is temporarily unavailable, and I could not read this file directly. Based on metadata:

- Title: ${resource.title}
- File type: ${resource.fileType || 'unknown'}
- Tags: ${resource.tags?.join(', ') || 'none'}

Please try again once the AI provider is available for a deeper answer.`;
  }

  const snippets = pickRelevantSentences(content, question, 5);
  return `Gemini is temporarily unavailable, so I searched the readable text locally.

${snippets.map((sentence) => `- ${sentence}`).join('\n')}

This is an extractive answer from "${resource.title}", not a full generative response.`;
};

const createLocalWorkspaceAnswer = async (question, resources) => {
  const lines = [];

  for (const resource of resources.slice(0, 8)) {
    const content = await readResourceContent(resource);
    const snippets = content ? pickRelevantSentences(content, question, 2) : [];
    lines.push(`- ${resource.title}${resource.fileType ? ` (${resource.fileType})` : ''}${resource.tags?.length ? ` - tags: ${resource.tags.join(', ')}` : ''}`);
    snippets.forEach((snippet) => lines.push(`  - ${snippet}`));
  }

  return `Gemini is temporarily unavailable, so I built a local workspace overview from available metadata and readable text.

${lines.join('\n')}

This fallback can help you keep working, but try again later for a richer AI answer.`;
};

const createLocalGeneratedNotes = (topic) => `# ${topic}

## Overview
Gemini is temporarily unavailable, so these are starter notes generated locally. They give you a clean structure to keep working until the AI provider is available again.

## What To Cover
- Definition and basic explanation
- Core concepts and vocabulary
- Step-by-step process or workflow
- Real examples
- Common mistakes or misconceptions
- Quick revision points

## Study Prompts
- What is the simplest explanation of ${topic}?
- Why does ${topic} matter?
- Where is ${topic} used in real projects or real life?
- What should a beginner remember first?

## Quick Takeaway
Use this as a placeholder resource and regenerate later for a full AI-written version.`;

const readResourceContent = async (resource) => {
  if (resource.aiContent && resource.aiContent.trim().length > 50) {
    return resource.aiContent;
  }

  if (!resource.fileUrl) return null;

  try {
    if (!fs.existsSync(resource.fileUrl)) {
      console.warn(`File not found on disk: ${resource.fileUrl}`);
      return null;
    }

    if (resource.compressed) {
      const buffer = fs.readFileSync(resource.fileUrl);
      return zlib.gunzipSync(buffer).toString('utf8');
    }

    const textTypes = [
      'text/',
      'application/json',
      'application/javascript',
      'application/xml',
      'text/markdown',
      'text/plain',
    ];
    const isText = textTypes.some((type) => resource.fileType?.startsWith(type));

    if (isText) {
      return fs.readFileSync(resource.fileUrl, 'utf8');
    }

    if (resource.fileType?.includes('pdf')) {
      return null;
    }

    return null;
  } catch (err) {
    console.error(`Failed to read resource file ${resource.fileUrl}:`, err.message);
    return null;
  }
};

const summarizeResource = async (resource) => {
  const content = await readResourceContent(resource);

  if (!content) {
    const metaPrompt = `A resource has been uploaded with the following details:
Title: "${resource.title}"
File type: ${resource.fileType || 'unknown'}
Tags: ${resource.tags?.join(', ') || 'none'}

Based on this information, provide:
1. What this resource is likely about
2. What kind of content it probably contains
3. How it might be useful

Note: The file content could not be read directly (binary format).
Be helpful but honest about the limitations.`;

    try {
      const { text, modelUsed } = await generateWithFallback(metaPrompt, { temperature: 0.5 });
      return {
        summary: text,
        modelUsed,
        contentRead: false,
        note: 'Summary based on file metadata only because the file content could not be read.',
      };
    } catch (err) {
      if (!isAIServiceError(err)) throw err;
      return {
        summary: createLocalSummary(resource, null),
        modelUsed: LOCAL_FALLBACK_MODEL,
        contentRead: false,
        note: err.message,
      };
    }
  }

  const truncated = content.length > 12000
    ? `${content.slice(0, 12000)}\n\n[Content truncated: showing first portion]`
    : content;

  const prompt = `You are an intelligent document analyzer.
Read the following content and provide a comprehensive summary.

DOCUMENT TITLE: "${resource.title}"
FILE TYPE: ${resource.fileType || 'text'}
TAGS: ${resource.tags?.join(', ') || 'none'}

CONTENT:
---
${truncated}
---

Provide a well-structured summary in this exact format:

## Summary
(3-5 clear paragraphs covering the main content)

## Key Points
- (8-10 most important points from the document)

## Main Topics Covered
- (List the primary subjects/topics discussed)

## Notable Details
(Any important specific information, data, names, or facts worth highlighting)

## Quick Takeaway
(Single sentence that captures the essence of this document)

Be accurate, thorough, and base your summary ONLY on the actual content provided.`;

  try {
    const { text, modelUsed } = await generateWithFallback(prompt, {
      temperature: 0.3,
      maxTokens: 4096,
    });

    return {
      summary: text,
      modelUsed,
      contentRead: true,
      contentLength: content.length,
    };
  } catch (err) {
    if (!isAIServiceError(err)) throw err;
    return {
      summary: createLocalSummary(resource, content),
      modelUsed: LOCAL_FALLBACK_MODEL,
      contentRead: true,
      contentLength: content.length,
      note: err.message,
    };
  }
};

const chatAboutResource = async (question, resource, conversationHistory = []) => {
  const content = await readResourceContent(resource);
  const contextSection = content
    ? `DOCUMENT CONTENT:
---
${content.length > 10000 ? `${content.slice(0, 10000)}\n[Content truncated]` : content}
---`
    : `DOCUMENT METADATA:
Title: "${resource.title}"
Type: ${resource.fileType || 'unknown'}
Tags: ${resource.tags?.join(', ') || 'none'}
Note: File content could not be read. Answer based on available metadata.`;

  const historyText = normalizeHistory(conversationHistory).map((msg) =>
    `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
  ).join('\n\n');

  const prompt = `You are a helpful AI assistant. You have access to the following document and must answer questions about it.

${contextSection}

${historyText ? `PREVIOUS CONVERSATION:\n${historyText}\n\n` : ''}CURRENT QUESTION: ${question}

Instructions:
- Answer ONLY based on the document content provided above
- If the answer is not in the document, say "This information is not covered in this document"
- Be specific and reference actual content from the document
- Keep answers clear and well-structured
- Use bullet points or numbered lists when helpful
- If giving a factual answer, be precise`;

  try {
    const { text, modelUsed } = await generateWithFallback(prompt, {
      temperature: 0.3,
      maxTokens: 2048,
    });

    return { answer: text, modelUsed, contentRead: !!content };
  } catch (err) {
    if (!isAIServiceError(err)) throw err;
    return {
      answer: createLocalResourceAnswer(question, resource, content),
      modelUsed: LOCAL_FALLBACK_MODEL,
      contentRead: !!content,
      note: err.message,
    };
  }
};

const chatAboutWorkspace = async (question, workspaceId, conversationHistory = []) => {
  const resources = await Resource.find({ workspaceId }).lean();

  if (resources.length === 0) {
    return {
      answer: 'This workspace has no resources yet. Upload some files or generate AI content first, then I can answer questions about them.',
      modelUsed: 'none',
      sourcesUsed: [],
    };
  }

  const sourceContents = [];
  for (const resource of resources.slice(0, 5)) {
    const content = await readResourceContent(resource);
    sourceContents.push({
      title: resource.title,
      content: content
        ? content.slice(0, 2000)
        : `[Binary or unreadable file: ${resource.fileType || 'unknown'}. Tags: ${resource.tags?.join(', ') || 'none'}]`,
    });
  }

  const sourcesText = sourceContents.map((source, index) =>
    `[RESOURCE ${index + 1}: "${source.title}"]\n${source.content}`
  ).join('\n\n---\n\n');

  const historyText = normalizeHistory(conversationHistory).map((msg) =>
    `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
  ).join('\n\n');

  const prompt = `You are an AI assistant for a collaborative workspace.
You have access to ${resources.length} resource(s) in this workspace.
Answer the user's question using the available content.

WORKSPACE RESOURCES:
${sourcesText}

${historyText ? `PREVIOUS CONVERSATION:\n${historyText}\n\n` : ''}QUESTION: ${question}

Instructions:
- Answer based on the workspace resources
- Mention which resource your answer comes from when relevant
- If asking about something not in any resource, say so clearly
- Be helpful, accurate, and concise`;

  try {
    const { text, modelUsed } = await generateWithFallback(prompt, {
      temperature: 0.3,
      maxTokens: 2048,
    });

    return {
      answer: text,
      modelUsed,
      sourcesUsed: sourceContents.map((source) => source.title),
    };
  } catch (err) {
    if (!isAIServiceError(err)) throw err;
    return {
      answer: await createLocalWorkspaceAnswer(question, resources),
      modelUsed: LOCAL_FALLBACK_MODEL,
      sourcesUsed: sourceContents.map((source) => source.title),
      note: err.message,
    };
  }
};

const generateContent = async (topic, type = 'notes') => {
  void type;
  const notesPrompt = `You are an expert educator creating comprehensive study notes.

Topic: "${topic}"

Create well-structured, detailed study notes in Markdown format:

# ${topic}

## 📌 Overview
(Clear 2-3 sentence introduction explaining what this is and why it matters)

## 🧠 Core Concepts
(Cover every major concept. For each one:)
### Concept Name
**What it is:** Clear definition
**How it works:** Step-by-step if needed
**Example:** Concrete example

## 📝 Key Points
- (10-12 important bullet points: specific and factual)

## 💡 How It Works (In Practice)
(Real-world application or step-by-step walkthrough)

## ⚠️ Common Mistakes to Avoid
- Mistake 1 and why it happens
- Mistake 2 and why it happens
- Mistake 3 and why it happens

## 🔑 Quick Reference
| Term | Meaning |
|------|---------|
(8-10 key terms with concise definitions)

## ✅ Summary
(3-4 sentence recap of everything covered)

Be thorough, accurate, and educational. Use **bold** for key terms.
Aim for 800-1200 words of genuine educational content.`;

  try {
    const { text, modelUsed } = await generateWithFallback(notesPrompt, {
      temperature: 0.6,
      maxTokens: 8192,
    });
    return { content: text, modelUsed };
  } catch (err) {
    if (!isAIServiceError(err)) throw err;
    return {
      content: createLocalGeneratedNotes(topic),
      modelUsed: LOCAL_FALLBACK_MODEL,
      note: err.message,
    };
  }
};

const generateEmbedding = async (text) => {
  try {
    const model = getEmbeddingModel();
    const result = await model.embedContent(text.slice(0, 2000));
    return result.embedding.values || [];
  } catch (err) {
    console.warn('Embedding skipped:', err.message);
    return [];
  }
};

const webSearch = async (query) => {
  const prompt = `Find 6 real, high-quality educational web resources about: "${query}".
Return ONLY a valid JSON array. No markdown. No explanation. Raw JSON only.
[
  {
    "title": "Resource title",
    "url": "https://real-url.com",
    "description": "2-3 sentences about this resource",
    "source": "Site name",
    "type": "Article/Video/Course/Documentation/Tutorial",
    "relevanceScore": 0.95
  }
]
Only trusted sources. Sort by relevanceScore descending.`;

  const { text } = await generateWithFallback(prompt, { temperature: 0.3 });
  const clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();

  try {
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const match = clean.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    return [];
  }
};

const cosineSimilarity = (a, b) => {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0));
  return magnitudeA && magnitudeB ? dot / (magnitudeA * magnitudeB) : 0;
};

const semanticSearch = async (query, workspaceId) => {
  const queryVector = await generateEmbedding(query);
  const filter = workspaceId ? { workspaceId } : {};
  const resources = await Resource.find(filter).lean();

  const scored = resources
    .map((resource) => ({
      ...resource,
      score: resource.embedding?.length ? cosineSimilarity(queryVector, resource.embedding) : 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  let summary = `Found ${scored.length} resource(s).`;
  if (scored.length > 0) {
    try {
      const { text } = await generateWithFallback(
        `User searched: "${query}". Results: ${scored.map((resource) => resource.title).join(', ')}. Write one helpful summary sentence.`,
        { temperature: 0.3, maxTokens: 100 }
      );
      summary = text;
    } catch {}
  }

  return { resources: scored, summary };
};

module.exports = {
  summarizeResource,
  chatAboutResource,
  chatAboutWorkspace,
  generateContent,
  generateEmbedding,
  webSearch,
  semanticSearch,
  readResourceContent,
};
