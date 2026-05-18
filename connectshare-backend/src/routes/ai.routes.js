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

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

router.post('/summarize', authMiddleware, async (req, res, next) => {
  try {
    const { resourceId } = req.body;
    if (!resourceId) {
      return res.status(400).json({ success: false, error: 'resourceId is required' });
    }

    const resource = await Resource.findById(resourceId).lean();
    if (!resource) {
      return res.status(404).json({ success: false, error: 'Resource not found' });
    }

    console.log(`AI summarize start: resource="${resource.title}"`);
    const result = await summarizeResource(resource);
    console.log(`AI summarize end: model=${result.modelUsed}, contentRead=${result.contentRead}`);

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
    console.error('Summarize error:', err.message);
    if (err.message?.includes('All Gemini models') || err.message?.includes('All AI models')) {
      return res.status(503).json({ success: false, error: 'AI service unavailable. Please try again later.' });
    }
    next(err);
  }
});

router.post('/chat', authMiddleware, async (req, res, next) => {
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

    console.log('\nAI Chat');
    console.log(`   Question: "${question.slice(0, 80)}"`);
    console.log(`   Mode: ${resourceId ? 'resource' : 'workspace'}`);
    console.log(`   History length: ${conversationHistory.length}`);

    let result;
    if (resourceId) {
      const resource = await Resource.findById(resourceId).lean();
      if (!resource) {
        return res.status(404).json({ success: false, error: 'Resource not found' });
      }

      console.log(`   Resource: "${resource.title}"`);
      result = await chatAboutResource(question.trim(), resource, conversationHistory);
      result.mode = 'resource';
      result.resourceTitle = resource.title;
    } else {
      console.log(`   Workspace: ${workspaceId}`);
      result = await chatAboutWorkspace(question.trim(), workspaceId, conversationHistory);
      result.mode = 'workspace';
    }

    console.log(`Chat answered: model=${result.modelUsed}`);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Chat error:', err.message);
    if (err.message?.includes('All Gemini models') || err.message?.includes('All AI models')) {
      return res.status(503).json({
        success: false,
        error: 'AI is temporarily unavailable. Please try again in a moment.',
      });
    }
    next(err);
  }
});

router.post('/generate', authMiddleware, async (req, res, next) => {
  try {
    const { prompt, type = 'notes', workspaceId, title, tags = [] } = req.body;

    if (!prompt?.trim()) {
      return res.status(400).json({ success: false, error: 'prompt is required' });
    }
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'workspaceId is required' });
    }

    console.log(`AI generate start: type=${type}, prompt="${prompt.slice(0, 60)}"`);
    const { content, modelUsed } = await generateContent(prompt.trim(), type);

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

    console.log(`AI generate end: model=${modelUsed}, resource="${resource.title}"`);
    res.status(201).json({
      success: true,
      data: { resource, content, modelUsed },
      message: 'Content generated and saved to workspace',
    });
  } catch (err) {
    console.error('Generate error:', err.message);
    if (err.message?.includes('All Gemini models') || err.message?.includes('All AI models')) {
      return res.status(503).json({ success: false, error: 'AI service unavailable. Please try again later.' });
    }
    next(err);
  }
});

router.post('/web-search', authMiddleware, async (req, res, next) => {
  try {
    const { query } = req.body;
    if (!query?.trim()) {
      return res.status(400).json({ success: false, error: 'query is required' });
    }

    console.log(`AI web-search start: query="${query}"`);
    const results = await webSearch(query.trim());
    console.log(`AI web-search end: model=generateWithFallback, results=${results.length}`);

    res.json({ success: true, data: { results } });
  } catch (err) {
    console.error('Web search error:', err.message);
    if (err.message?.includes('All Gemini models') || err.message?.includes('All AI models')) {
      return res.status(503).json({ success: false, error: 'AI service unavailable. Please try again later.' });
    }
    next(err);
  }
});

module.exports = router;
