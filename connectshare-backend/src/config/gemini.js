const { GoogleGenAI } = require('@google/genai');

const MODEL_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const DEFAULT_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 30000);
const MAX_TRANSIENT_RETRIES = Math.max(0, Number(process.env.GEMINI_TRANSIENT_RETRIES || 2));
const BASE_BACKOFF_MS = Number(process.env.GEMINI_BACKOFF_MS || 400);

const apiKey = (process.env.GEMINI_API_KEY || '').trim();
const genAI = apiKey ? new GoogleGenAI({ apiKey }) : null;
const modelCache = new Map();

const nowIso = () => new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const logAI = (level, event, details = {}) => {
  const payload = {
    ts: nowIso(),
    service: 'gemini',
    event,
    ...details,
  };
  const line = `[AI] ${JSON.stringify(payload)}`;
  if (level === 'error') return console.error(line);
  if (level === 'warn') return console.warn(line);
  return console.log(line);
};

const sanitizePrompt = (prompt = '') => {
  const compact = String(prompt).replace(/\s+/g, ' ').trim();
  return compact.length > 240 ? `${compact.slice(0, 240)}...` : compact;
};

const sanitizeErrorMessage = (message = '') => {
  const compact = String(message).replace(/\s+/g, ' ').trim();
  return compact.length > 600 ? `${compact.slice(0, 600)}...` : compact;
};

const createAIError = (message, status = 503, details = {}) => {
  const err = new Error(message);
  err.status = status;
  err.isAIError = true;
  err.reason = details.reason || 'ai_generation_failed';
  err.modelAttempted = details.modelAttempted || MODEL_CHAIN[0];
  err.fallbacksTried = details.fallbacksTried || [];
  err.failures = details.failures || [];
  err.timestamp = details.timestamp || nowIso();
  err.cause = details.cause;
  return err;
};

const toStatus = (err) => Number(err?.status || err?.statusCode || err?.code || err?.response?.status || 0);

const errorText = (err) => [
  err?.message,
  err?.status,
  err?.statusCode,
  err?.code,
  err?.name,
  err?.response?.status,
  err?.response?.statusText,
  err?.response?.data?.error?.message,
  err?.response?.data?.error?.status,
].filter(Boolean).join(' ').toLowerCase();

const classifyError = (err) => {
  const status = toStatus(err);
  const text = errorText(err);

  if (text.includes('timeout') || text.includes('deadline') || text.includes('aborted')) return 'timeout';
  if (status === 401 || status === 403 || text.includes('api key') || text.includes('unauthorized') || text.includes('forbidden') || text.includes('permission_denied')) return 'auth';
  if (status === 404 || text.includes('not found') || text.includes('not supported') || text.includes('deprecated') || text.includes('shut down')) return 'model_unavailable';
  if (status === 429 || text.includes('quota') || text.includes('rate limit') || text.includes('resource_exhausted')) return 'quota';
  if ([500, 502, 503, 504].includes(status) || text.includes('overloaded') || text.includes('temporarily unavailable') || text.includes('econnreset') || text.includes('network') || text.includes('fetch failed')) return 'transient';
  if (text.includes('candidate') || text.includes('malformed') || text.includes('empty')) return 'malformed_response';
  return 'unknown';
};

const reasonForFailures = (failures) => {
  if (failures.some((failure) => failure.reason === 'auth')) return 'gemini_auth_or_config';
  if (failures.every((failure) => failure.reason === 'model_unavailable')) return 'all_models_unavailable';
  if (failures.every((failure) => failure.reason === 'quota')) return 'quota_exhausted';
  if (failures.some((failure) => failure.reason === 'timeout')) return 'gemini_timeout';
  if (failures.some((failure) => failure.reason === 'malformed_response')) return 'malformed_gemini_response';
  return 'all_models_failed';
};

const assertConfigured = () => {
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw createAIError('Gemini API key is missing. Add GEMINI_API_KEY to the backend environment.', 503, {
      reason: 'missing_api_key',
      fallbacksTried: [],
    });
  }
};

const withTimeout = (promise, timeoutMs, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${timeoutMs}ms`);
      err.code = 'GEMINI_TIMEOUT';
      reject(err);
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const extractText = (result) => {
  if (!result) return '';

  if (typeof result.text === 'string') return result.text.trim();
  if (typeof result.text === 'function') {
    const text = result.text();
    if (typeof text === 'string') return text.trim();
  }

  const legacyResponse = result.response;
  if (typeof legacyResponse?.text === 'function') {
    const text = legacyResponse.text();
    if (typeof text === 'string') return text.trim();
  }
  if (typeof legacyResponse?.text === 'string') return legacyResponse.text.trim();

  const candidates = result.candidates || legacyResponse?.candidates || [];
  const parts = candidates
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => part?.text)
    .filter((text) => typeof text === 'string' && text.trim());

  return parts.join('\n').trim();
};

const normalizeFailure = (modelName, attempt, err, durationMs) => ({
  model: modelName,
  attempt,
  reason: classifyError(err),
  message: sanitizeErrorMessage(err?.message || 'Unknown Gemini error'),
  status: toStatus(err) || undefined,
  durationMs,
});

const getCachedModel = (modelName) => {
  if (!modelCache.has(modelName)) {
    modelCache.set(modelName, { model: modelName });
  }
  return modelCache.get(modelName);
};

const generateWithModel = async (modelName, prompt, options) => {
  const request = {
    model: modelName,
    contents: prompt,
    config: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens || 8192,
    },
  };

  return withTimeout(
    genAI.models.generateContent(request),
    options.timeoutMs || DEFAULT_TIMEOUT_MS,
    `Gemini ${modelName} generateContent`
  );
};

const generateWithFallback = async (prompt, options = {}) => {
  assertConfigured();

  const requestId = options.requestId || `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const failures = [];
  const fallbacksTried = [];

  logAI('info', 'generate.start', {
    requestId,
    promptPreview: sanitizePrompt(prompt),
    promptChars: String(prompt || '').length,
    modelChain: MODEL_CHAIN,
  });

  for (const modelName of MODEL_CHAIN) {
    fallbacksTried.push(modelName);

    for (let attempt = 1; attempt <= MAX_TRANSIENT_RETRIES + 1; attempt += 1) {
      const attemptStartedAt = Date.now();
      logAI('info', 'generate.attempt', { requestId, model: modelName, attempt });

      try {
        getCachedModel(modelName);
        const result = await generateWithModel(modelName, prompt, options);
        const text = extractText(result);

        if (!text) {
          const err = new Error('Gemini returned an empty or malformed response');
          err.code = 'EMPTY_GEMINI_RESPONSE';
          throw err;
        }

        logAI('info', 'generate.success', {
          requestId,
          model: modelName,
          attempt,
          durationMs: Date.now() - attemptStartedAt,
          totalDurationMs: Date.now() - startedAt,
          responseChars: text.length,
        });

        return {
          text,
          modelUsed: modelName,
          fallbacksTried,
          durationMs: Date.now() - startedAt,
        };
      } catch (err) {
        const failure = normalizeFailure(modelName, attempt, err, Date.now() - attemptStartedAt);
        failures.push(failure);

        logAI(failure.reason === 'auth' ? 'error' : 'warn', 'generate.failure', {
          requestId,
          ...failure,
        });

        if (failure.reason === 'transient' || failure.reason === 'timeout') {
          if (attempt <= MAX_TRANSIENT_RETRIES) {
            const delayMs = BASE_BACKOFF_MS * (2 ** (attempt - 1));
            logAI('warn', 'generate.retry', { requestId, model: modelName, attempt, delayMs });
            await sleep(delayMs);
            continue;
          }
        }

        if (modelName !== MODEL_CHAIN[MODEL_CHAIN.length - 1]) {
          logAI('warn', 'generate.fallback', {
            requestId,
            fromModel: modelName,
            toModel: MODEL_CHAIN[MODEL_CHAIN.indexOf(modelName) + 1],
            reason: failure.reason,
          });
        }
        break;
      }
    }
  }

  throw createAIError('All configured Gemini models failed. Please try again shortly.', 503, {
    reason: reasonForFailures(failures),
    modelAttempted: MODEL_CHAIN[0],
    fallbacksTried,
    failures,
  });
};

const getEmbeddingModel = () => {
  assertConfigured();

  return {
    embedContent: async (text) => {
      const result = await withTimeout(
        genAI.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: String(text || '').slice(0, 2000),
        }),
        DEFAULT_TIMEOUT_MS,
        `Gemini ${EMBEDDING_MODEL} embedContent`
      );
      const values = result?.embedding?.values || result?.embeddings?.[0]?.values || [];
      return { embedding: { values } };
    },
  };
};

const getStartupDiagnostics = () => ({
  configured: !!genAI,
  modelChain: MODEL_CHAIN,
  embeddingModel: EMBEDDING_MODEL,
  sdk: '@google/genai',
  timeoutMs: DEFAULT_TIMEOUT_MS,
  transientRetries: MAX_TRANSIENT_RETRIES,
});

const testGemini = async () => {
  logAI('info', 'startup.validation', getStartupDiagnostics());
  try {
    const { text, modelUsed } = await generateWithFallback('Respond with exactly one word: ready', {
      temperature: 0,
      maxTokens: 8,
      timeoutMs: Math.min(DEFAULT_TIMEOUT_MS, 15000),
      requestId: 'startup-gemini-test',
    });
    logAI('info', 'startup.validation.success', { modelUsed, response: text.trim() });
    return { success: true, modelUsed };
  } catch (err) {
    logAI('error', 'startup.validation.failed', {
      error: err.message,
      reason: err.reason,
      fallbacksTried: err.fallbacksTried,
    });
    return { success: false, error: err.message, reason: err.reason };
  }
};

module.exports = {
  generateWithFallback,
  getEmbeddingModel,
  getCachedModel,
  getStartupDiagnostics,
  testGemini,
  MODEL_CHAIN,
  EMBEDDING_MODEL,
  genAI,
};
