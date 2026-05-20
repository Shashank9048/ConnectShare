const loadGeminiConfig = (generateContentMock) => {
  jest.resetModules();
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GEMINI_TIMEOUT_MS = '25';
  process.env.GEMINI_TRANSIENT_RETRIES = '1';
  process.env.GEMINI_BACKOFF_MS = '1';

  jest.doMock('@google/genai', () => ({
    GoogleGenAI: jest.fn().mockImplementation(() => ({
      models: {
        generateContent: generateContentMock,
        embedContent: jest.fn().mockResolvedValue({ embeddings: [{ values: [0.1, 0.2] }] }),
      },
    })),
  }));

  return require('../src/config/gemini');
};

const makeGeminiError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

describe('Gemini config fallback behavior', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.dontMock('@google/genai');
  });

  test('falls back from unavailable primary to gemini-2.0-flash', async () => {
    const generateContent = jest.fn()
      .mockRejectedValueOnce(makeGeminiError(404, 'model not found'))
      .mockResolvedValueOnce({ text: 'ready' });
    const { generateWithFallback } = loadGeminiConfig(generateContent);

    const result = await generateWithFallback('hello');

    expect(result.modelUsed).toBe('gemini-2.0-flash');
    expect(result.text).toBe('ready');
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  test('falls back on quota errors', async () => {
    const generateContent = jest.fn()
      .mockRejectedValueOnce(makeGeminiError(429, 'quota exceeded'))
      .mockResolvedValueOnce({ text: 'quota fallback ok' });
    const { generateWithFallback } = loadGeminiConfig(generateContent);

    const result = await generateWithFallback('hello');

    expect(result.modelUsed).toBe('gemini-2.0-flash');
    expect(result.text).toBe('quota fallback ok');
  });

  test('retries transient failures before changing model', async () => {
    const generateContent = jest.fn()
      .mockRejectedValueOnce(makeGeminiError(503, 'temporarily unavailable'))
      .mockResolvedValueOnce({ text: 'retry ok' });
    const { generateWithFallback } = loadGeminiConfig(generateContent);

    const result = await generateWithFallback('hello');

    expect(result.modelUsed).toBe('gemini-2.5-flash');
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  test('returns structured auth errors when the API key is invalid', async () => {
    const generateContent = jest.fn().mockRejectedValue(makeGeminiError(403, 'api key rejected'));
    const { generateWithFallback, MODEL_CHAIN } = loadGeminiConfig(generateContent);

    await expect(generateWithFallback('hello')).rejects.toMatchObject({
      isAIError: true,
      reason: 'gemini_auth_or_config',
      modelAttempted: 'gemini-2.5-flash',
      fallbacksTried: MODEL_CHAIN,
    });
  });

  test('treats malformed empty responses as structured AI failures', async () => {
    const generateContent = jest.fn().mockResolvedValue({ candidates: [] });
    const { generateWithFallback } = loadGeminiConfig(generateContent);

    await expect(generateWithFallback('hello')).rejects.toMatchObject({
      isAIError: true,
      reason: 'malformed_gemini_response',
      modelAttempted: 'gemini-2.5-flash',
    });
  });
});
