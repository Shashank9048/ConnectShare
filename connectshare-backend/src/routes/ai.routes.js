const router = require('express').Router();
const authMiddleware = require('../middleware/auth.middleware');
const {
  summarizeResource,
  chatAboutResource,
  chatAboutWorkspace,
  generateContent,
  generateEmbedding,
  webSearch,
} = require('../services/ai.service');
const Resource = require('../models/Resource.model');
const eventBus = require('../events/eventBus');
const fs = require('fs');
const path = require('path');
const { ensureUploadDir } = require('../utils/storagePaths');

const uploadsDir = ensureUploadDir();

const requestId = () => `ai-route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const isAIUnavailable = (err) =>
  err?.isAIError ||
  err.message?.includes('All Gemini models') ||
  err.message?.includes('All AI models') ||
  err.message?.includes('configured Gemini models');

const sendAIUnavailable = (res, err, fallbackMessage = 'AI service unavailable. Please try again later.') => {
  return res.status(err.status || 503).json({
    success: false,
    error: err.message || fallbackMessage,
    reason: err.reason || 'ai_unavailable',
    modelAttempted: err.modelAttempted || 'gemini-2.5-flash',
    fallbacksTried: err.fallbacksTried || [],
    timestamp: err.timestamp || new Date().toISOString(),
    ...(process.env.NODE_ENV !== 'production' && err.failures ? { failures: err.failures } : {}),
  });
};

router.post('/summarize', authMiddleware, async (req, res, next) => {
  const rid = requestId();
  try {
    const { resourceId } = req.body;
    if (!resourceId) {
      return res.status(400).json({ success: false, error: 'resourceId is required' });
    }

    const resource = await Resource.findById(resourceId).lean();
    if (!resource) {
      return res.status(404).json({ success: false, error: 'Resource not found' });
    }

    console.log(`[AI_ROUTE] ${JSON.stringify({ requestId: rid, event: 'summarize.start', resourceId, resourceTitle: resource.title })}`);
    const result = await summarizeResource(resource);
    console.log(`[AI_ROUTE] ${JSON.stringify({ requestId: rid, event: 'summarize.end', modelUsed: result.modelUsed, contentRead: result.contentRead })}`);

    res.json({
      success: true,
      data: {
        summary: result.summary,
        modelUsed: result.modelUsed,
        contentRead: result.contentRead,
        note: result.note || null,
        resource: {
          id: resource._id,
          title: resource.title,
          fileType: resource.fileType,
          tags: resource.tags,
        },
      },
    });
  } catch (err) {
    console.error(`[AI_ROUTE] ${JSON.stringify({ requestId: rid, event: 'summarize.error', error: err.message, reason: err.reason })}`);
    if (isAIUnavailable(err)) {
      return sendAIUnavailable(res, err);
    }
    next(err);
  }
});

router.post('/chat', authMiddleware, async (req, res, next) => {
  const rid = requestId();
  try {
    const { question, resourceId, workspaceId, conversationHistory = [] } = req.body;

    if (!question?.trim()) {
      return res.status(400).json({ success: false, error: 'question is required' });
    }
    if (!resourceId && !workspaceId) {
      return res.status(400).json({
        success: false,
        error: 'Provide either resourceId (to chat about one resource) or workspaceId (to chat about all workspace resources)',
      });
    }

    console.log(`[AI_ROUTE] ${JSON.stringify({
      requestId: rid,
      event: 'chat.start',
      questionPreview: question.slice(0, 120),
      mode: resourceId ? 'resource' : 'workspace',
      historyLength: Array.isArray(conversationHistory) ? conversationHistory.length : 0,
    })}`);

    let result;
    if (resourceId) {
      const resource = await Resource.findById(resourceId).lean();
      if (!resource) {
        return res.status(404).json({ success: false, error: 'Resource not found' });
      }

      console.log(`[AI_ROUTE] ${JSON.stringify({ requestId: rid, event: 'chat.resource', resourceId, resourceTitle: resource.title })}`);
      result = await chatAboutResource(question.trim(), resource, conversationHistory);
      result.mode = 'resource';
      result.resourceTitle = resource.title;
    } else {
      console.log(`[AI_ROUTE] ${JSON.stringify({ requestId: rid, event: 'chat.workspace', workspaceId })}`);
      result = await chatAboutWorkspace(question.trim(), workspaceId, conversationHistory);
      result.mode = 'workspace';
    }

    console.log(`[AI_ROUTE] ${JSON.stringify({ requestId: rid, event: 'chat.end', modelUsed: result.modelUsed, mode: result.mode })}`);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error(`[AI_ROUTE] ${JSON.stringify({ requestId: rid, event: 'chat.error', error: err.message, reason: err.reason })}`);
    if (isAIUnavailable(err)) {
      return sendAIUnavailable(res, err, 'AI is temporarily unavailable. Please try again in a moment.');
    }
    next(err);
  }
});

router.post('/generate', authMiddleware, async (req, res, next) => {
  const rid = requestId();
  try {
    const { prompt, type = 'notes', workspaceId, title, tags = [] } = req.body;

    if (!prompt?.trim()) {
      return res.status(400).json({ success: false, error: 'prompt is required' });
    }
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'workspaceId is required' });
    }

    console.log(`[AI_ROUTE] ${JSON.stringify({ requestId: rid, event: 'generate.start', type, promptPreview: prompt.slice(0, 120), workspaceId })}`);
    const { content, modelUsed, note } = await generateContent(prompt.trim(), type);

    const fileName = `${Date.now()}-ai-${type}.md`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, content, 'utf8');

    const tagArray = Array.isArray(tags)
      ? tags
      : tags.split(',').map((tag) => tag.trim()).filter(Boolean);
    const embedding = await generateEmbedding(`${title || prompt} ${tagArray.join(' ')} ${content.slice(0, 500)}`);

    const resource = await Resource.create({
      title: title?.trim() || `${type.charAt(0).toUpperCase() + type.slice(1)}: ${prompt.slice(0, 60)}`,
      fileUrl: filePath,
      fileType: 'text/markdown',
      tags: [...tagArray, 'ai-generated', type].filter(Boolean),
      owner: req.user.id,
      workspaceId,
      embedding,
      compressed: false,
      isAIGenerated: true,
      aiContent: content,
      fileSize: Buffer.byteLength(content, 'utf8'),
    });

    eventBus.emit('resource:uploaded', {
      userId: req.user.id,
      resourceId: resource._id,
      workspaceId,
    });

    console.log(`[AI_ROUTE] ${JSON.stringify({ requestId: rid, event: 'generate.end', modelUsed, resourceId: resource._id, resourceTitle: resource.title })}`);
    res.status(201).json({
      success: true,
      data: { resource, content, modelUsed, note: note || null },
      message: modelUsed === 'local-fallback'
        ? 'Fallback notes saved to workspace. Try regenerating later for full AI output.'
        : 'Content generated and saved to workspace',
    });
  } catch (err) {
    console.error(`[AI_ROUTE] ${JSON.stringify({ requestId: rid, event: 'generate.error', error: err.message, reason: err.reason })}`);
    if (isAIUnavailable(err)) {
      return sendAIUnavailable(res, err);
    }
    next(err);
  }
});

router.post('/web-search', authMiddleware, async (req, res, next) => {
  const rid = requestId();
  try {
    const { query } = req.body;
    if (!query?.trim()) {
      return res.status(400).json({ success: false, error: 'query is required' });
    }

    console.log(`[AI_ROUTE] ${JSON.stringify({ requestId: rid, event: 'web_search.start', queryPreview: query.slice(0, 120) })}`);
    const results = await webSearch(query.trim());
    console.log(`[AI_ROUTE] ${JSON.stringify({ requestId: rid, event: 'web_search.end', results: results.length })}`);

    res.json({ success: true, data: { results } });
  } catch (err) {
    console.error(`[AI_ROUTE] ${JSON.stringify({ requestId: rid, event: 'web_search.error', error: err.message, reason: err.reason })}`);
    if (isAIUnavailable(err)) {
      return sendAIUnavailable(res, err);
    }
    next(err);
  }
});

module.exports = router;
