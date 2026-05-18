const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model priority chain — tries each in order
const MODEL_CHAIN = [
  'gemini-2.5-flash',     // Primary — fastest, most capable
  'gemini-2.0-flash',     // Secondary fallback
  'gemini-1.5-flash',     // Final fallback
];

const EMBEDDING_MODEL = 'text-embedding-004';

// Get a working generative model — tries each model in chain
const getModel = async () => {
  for (const modelName of MODEL_CHAIN) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      // Quick test to confirm model is available
      await model.generateContent('ping');
      console.log(`✅ Using model: ${modelName}`);
      return { model, modelName };
    } catch (err) {
      if (err.message?.includes('404') || err.message?.includes('not found') || err.message?.includes('not supported')) {
        console.warn(`⚠️ Model ${modelName} unavailable, trying next...`);
        continue;
      }
      // Other errors (quota, auth) — don't try next model
      throw err;
    }
  }
  throw new Error('All Gemini models unavailable. Check your API key and quota.');
};

// Cache the working model to avoid re-testing on every call
let _cachedModel = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getCachedModel = async () => {
  if (_cachedModel && Date.now() - _cacheTime < CACHE_TTL) {
    return _cachedModel;
  }
  const result = await getModel();
  _cachedModel = result;
  _cacheTime = Date.now();
  return result;
};

const getEmbeddingModel = () => {
  return genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
};

// Generate content with automatic model fallback
const generateWithFallback = async (prompt, options = {}) => {
  for (const modelName of MODEL_CHAIN) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: options.temperature || 0.7,
          maxOutputTokens: options.maxTokens || 8192,
        },
      });
      console.log(`🤖 Generating with ${modelName}...`);
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      console.log(`✅ ${modelName} responded — ${text.length} chars`);
      return { text, modelUsed: modelName };
    } catch (err) {
      if (err.message?.includes('404') || err.message?.includes('not found') || err.message?.includes('not supported')) {
        console.warn(`⚠️ ${modelName} failed: ${err.message}. Trying next...`);
        continue;
      }
      if (err.message?.includes('quota') || err.message?.includes('429')) {
        console.warn(`⚠️ ${modelName} quota exceeded. Trying next...`);
        continue;
      }
      throw err; // Auth errors, etc — don't retry
    }
  }
  throw new Error('All AI models failed. Please try again later.');
};

const testGemini = async () => {
  console.log('🔧 Testing Gemini API...');
  try {
    const { text, modelUsed } = await generateWithFallback('Respond with exactly one word: ready');
    console.log(`✅ Gemini working — model: ${modelUsed}, response: ${text.trim()}`);
    return { success: true, modelUsed };
  } catch (err) {
    console.error('❌ Gemini test failed:', err.message);
    return { success: false, error: err.message };
  }
};

module.exports = { generateWithFallback, getEmbeddingModel, testGemini, MODEL_CHAIN };
