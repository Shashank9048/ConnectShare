import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, Send, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useToast } from '../../hooks/useToast';

type Tab = 'Generate' | 'Summarize' | 'Chat';
type ChatMode = 'resource' | 'workspace';
type Role = 'user' | 'assistant';

interface Resource {
  _id: string;
  title: string;
  fileType?: string;
  type?: string;
  tags?: string[];
  fileSize?: number;
  isAIGenerated?: boolean;
}

interface Message {
  id: string;
  role: Role;
  content: string;
  modelUsed?: string;
  sourcesUsed?: string[];
  contentRead?: boolean;
  isError?: boolean;
  retryQuestion?: string;
  timestamp: string;
}

interface SummaryResult {
  summary: string;
  modelUsed: string;
  contentRead: boolean;
  note?: string | null;
  resource: {
    id: string;
    title: string;
    fileType?: string;
    tags?: string[];
  };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  defaultTab?: Tab;
  defaultResourceId?: string;
  onResourceCreated?: () => void;
}

const TABS: Tab[] = ['Generate', 'Summarize', 'Chat'];
const loadingSteps = ['Reading file...', 'Analyzing content...', 'Writing summary...'];
const AI_REQUEST_TIMEOUT_MS = 45000;

const escapeHtml = (text: string): string => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const renderMarkdown = (text: string): string => {
  return escapeHtml(text)
    .replace(/^### (.+)$/gm, '<h3 style="color:var(--text-primary);margin:14px 0 6px;font-size:14px;font-weight:700">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color:var(--text-primary);margin:18px 0 8px;font-size:16px;font-weight:700;border-bottom:1px solid var(--border);padding-bottom:4px">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="color:var(--text-primary);margin:20px 0 10px;font-size:18px;font-weight:800">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text-primary);font-weight:700">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em style="color:var(--text-muted)">$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(99,102,241,0.15);padding:2px 6px;border-radius:4px;font-family:monospace;font-size:12px;color:#A5B4FC">$1</code>')
    .replace(/^- (.+)$/gm, '<div style="display:flex;gap:8px;margin:3px 0"><span style="color:#6366F1;flex-shrink:0">•</span><span style="color:var(--text-primary);line-height:1.5">$1</span></div>')
    .replace(/^(\d+)\. (.+)$/gm, '<div style="display:flex;gap:8px;margin:3px 0"><span style="color:#6366F1;flex-shrink:0;font-weight:700">$1.</span><span style="color:var(--text-primary);line-height:1.5">$2</span></div>')
    .replace(/\n\n/g, '<div style="margin:8px 0"></div>')
    .replace(/\n/g, '<br/>');
};

const getAIErrorMessage = (err: any, fallback: string) => {
  if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return 'Request cancelled.';
  if (err?.code === 'ECONNABORTED') return 'AI request timed out. Please try again.';

  const data = err?.response?.data;
  if (data?.error && data?.reason) return `${data.error} (${data.reason})`;
  return data?.error || err?.message || fallback;
};

const formatBytes = (bytes?: number) => {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const iconForResource = (resource?: Resource) => {
  const type = `${resource?.fileType || resource?.type || ''}`.toLowerCase();
  if (resource?.isAIGenerated) return '🤖';
  if (type.includes('pdf')) return '📄';
  if (type.includes('image')) return '🖼️';
  if (type.includes('text') || type.includes('markdown') || type.includes('json')) return '📝';
  return '📎';
};

const isLikelyReadable = (resource?: Resource) => {
  const type = `${resource?.fileType || resource?.type || ''}`.toLowerCase();
  return !!resource?.isAIGenerated ||
    type.startsWith('text/') ||
    type.includes('markdown') ||
    type.includes('json') ||
    type.includes('javascript') ||
    type.includes('xml');
};

const MarkdownBlock = ({ content }: { content: string }) => (
  <div
    style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-primary)' }}
    dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
  />
);

export default function AIAssistantPanel({
  isOpen,
  onClose,
  workspaceId,
  defaultTab = 'Generate',
  defaultResourceId,
  onResourceCreated,
}: Props) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceSearch, setResourceSearch] = useState('');

  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');

  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');

  const [mode, setMode] = useState<ChatMode>('resource');
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [selectedResourceTitle, setSelectedResourceTitle] = useState('');
  const [conversation, setConversation] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatAbortControllerRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const fetchResources = useCallback(async () => {
    if (!workspaceId) return;
    const res = await api.get(`/api/v1/resources?workspaceId=${workspaceId}&limit=100`);
    const nextResources = res.data.data.resources || [];
    setResources(nextResources);

    if (defaultResourceId) {
      const found = nextResources.find((resource: Resource) => resource._id === defaultResourceId);
      setSelectedResource(found || null);
      setSelectedResourceId(defaultResourceId);
      setSelectedResourceTitle(found?.title || '');
    }
  }, [defaultResourceId, workspaceId]);

  const filteredResources = useMemo(() => {
    const query = resourceSearch.trim().toLowerCase();
    if (!query) return resources;
    return resources.filter((resource) =>
      resource.title.toLowerCase().includes(query) ||
      resource.tags?.some((tag) => tag.toLowerCase().includes(query))
    );
  }, [resourceSearch, resources]);

  const canChat = mode === 'workspace' || !!selectedResourceId;
  const tagPreview = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  const selectedChatResource = resources.find((resource) => resource._id === selectedResourceId);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(defaultTab);
    if (defaultResourceId) {
      setMode('resource');
      setSelectedResourceId(defaultResourceId);
    } else if (defaultTab === 'Generate') {
      setSelectedResource(null);
      setSelectedResourceId('');
    }
  }, [defaultResourceId, defaultTab, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    fetchResources().catch(() => addToast('Could not load workspace resources', 'error'));
  }, [addToast, fetchResources, isOpen]);

  useEffect(() => {
    if (!selectedResourceId) {
      setSelectedResourceTitle('');
      return;
    }
    const found = resources.find((resource) => resource._id === selectedResourceId);
    setSelectedResourceTitle(found?.title || '');
  }, [resources, selectedResourceId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, chatLoading]);

  useEffect(() => {
    setConversation([]);
    setInput('');
    chatAbortControllerRef.current?.abort();
    chatAbortControllerRef.current = null;
    setChatLoading(false);
  }, [mode, selectedResourceId]);

  useEffect(() => {
    if (!isOpen) {
      chatAbortControllerRef.current?.abort();
      chatAbortControllerRef.current = null;
      setChatLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedResourceId || mode === 'workspace') {
      window.setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [mode, selectedResourceId]);

  const copyText = async (text: string, label = 'Copied') => {
    await navigator.clipboard.writeText(text);
    addToast(label, 'success');
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      addToast('Please enter a topic or prompt', 'error');
      return;
    }
    if (!workspaceId) {
      addToast('No workspace selected', 'error');
      return;
    }

    setGenerating(true);
    setGeneratedContent('');

    try {
      const tagArray = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
      const res = await api.post(
        '/api/v1/ai/generate',
        {
          prompt: prompt.trim(),
          type: 'notes',
          workspaceId,
          title: title.trim() || undefined,
          tags: tagArray,
        },
        { timeout: AI_REQUEST_TIMEOUT_MS }
      );
      const data = res.data.data;
      setGeneratedContent(data.content);
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      onResourceCreated?.();
      fetchResources().catch(() => undefined);
      addToast(
        data.modelUsed === 'local-fallback'
          ? 'Fallback notes saved. Try again later for full AI output.'
          : 'Notes generated and saved to workspace!',
        'success'
      );
    } catch (err: any) {
      const msg = getAIErrorMessage(err, 'Generation failed');
      addToast(msg, 'error');
      console.error('Generate error:', err.response?.data || err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleSummarize = async () => {
    if (!selectedResource) return;
    setSummarizing(true);
    setSummary(null);

    let step = 0;
    setLoadingStep(loadingSteps[0]);
    const interval = window.setInterval(() => {
      step = (step + 1) % loadingSteps.length;
      setLoadingStep(loadingSteps[step]);
    }, 2000);

    try {
      const res = await api.post('/api/v1/ai/summarize', { resourceId: selectedResource._id }, { timeout: AI_REQUEST_TIMEOUT_MS });
      setSummary(res.data.data);
      addToast('Summary generated', 'success');
    } catch (err: any) {
      addToast(getAIErrorMessage(err, 'Summarization failed. Please try again.'), 'error');
    } finally {
      window.clearInterval(interval);
      setSummarizing(false);
      setLoadingStep('');
    }
  };

  const handleSaveSummary = async () => {
    if (!summary) return;
    const file = new File([summary.summary], `${summary.resource.title}-summary.md`, { type: 'text/markdown' });
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', `Summary: ${summary.resource.title}`);
    formData.append('tags', 'summary,ai-generated');
    formData.append('workspaceId', workspaceId);

    try {
      await api.post('/api/v1/resources/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      addToast('Summary saved as a resource', 'success');
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      onResourceCreated?.();
      fetchResources().catch(() => undefined);
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Could not save summary', 'error');
    }
  };

  const sendMessage = async (questionText?: string) => {
    const question = (questionText || input).trim();
    if (!question) return;
    if (chatLoading) return;

    if (mode === 'resource' && !selectedResourceId) {
      addToast('Please select a resource first', 'error');
      return;
    }

    const history = conversation.slice(-6).map((message) => ({
      role: message.role,
      content: message.content,
    }));
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    };

    setInput('');
    setConversation((prev) => [...prev, userMessage]);
    setChatLoading(true);
    chatAbortControllerRef.current?.abort();
    const controller = new AbortController();
    chatAbortControllerRef.current = controller;

    try {
      const payload = {
        question,
        conversationHistory: history,
        ...(mode === 'resource' ? { resourceId: selectedResourceId } : { workspaceId }),
      };
      const res = await api.post('/api/v1/ai/chat', payload, {
        signal: controller.signal,
        timeout: AI_REQUEST_TIMEOUT_MS,
      });
      const data = res.data.data;
      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: data.answer || 'I could not produce a response. Please try again.',
        modelUsed: data.modelUsed,
        sourcesUsed: data.sourcesUsed || [],
        contentRead: data.contentRead,
        timestamp: new Date().toISOString(),
      };
      setConversation((prev) => [...prev, aiMessage]);
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
      const errorText = getAIErrorMessage(err, 'AI chat failed. Please try again.');
      addToast(errorText, 'error');
      setConversation((prev) => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Warning: ${errorText}`,
        isError: true,
        retryQuestion: question,
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      if (chatAbortControllerRef.current === controller) {
        chatAbortControllerRef.current = null;
      }
      setChatLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleChatKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const suggestions = mode === 'resource'
    ? [
        'What is this document about?',
        'Summarize the key points',
        'What are the main topics covered?',
        'Explain the most important concept',
        'What should I remember from this?',
      ]
    : [
        'Give me an overview of all resources',
        'What topics are covered in this workspace?',
        'Which resource covers this topic?',
        'Summarize everything in this workspace',
      ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="ai-assistant-panel fixed top-0 right-0 h-full w-[420px] bg-bg-card border-l border-border-color shadow-2xl z-50 flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
          >
            <header className="p-5 border-b border-border-color flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-extrabold text-text-primary">✨ AI Assistant</h2>
                <p className="text-xs text-text-muted mt-1">Powered by Gemini</p>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-bg-secondary text-text-muted hover:text-text-primary">
                <X size={18} />
              </button>
            </header>

            <div className="px-4 pt-4 grid grid-cols-3 gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === tab ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'border border-border-color text-text-muted hover:text-text-primary hover:bg-bg-secondary'}`}
                >
                  {tab === 'Generate' ? '📝' : tab === 'Summarize' ? '📄' : '💬'} {tab}
                </button>
              ))}
            </div>

            <main className="flex-1 overflow-hidden">
              {activeTab === 'Generate' && (
                <motion.section
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="h-full overflow-y-auto p-5 space-y-4"
                >
                  <div>
                    <h3 className="text-base font-extrabold text-text-primary">📝 Generate Notes</h3>
                    <p className="text-xs text-text-muted mt-1">AI-powered notes from any topic.</p>
                  </div>

                  <label className="block">
                    <span className="block mb-2 text-[11px] font-extrabold uppercase tracking-wide text-text-muted">Topic or Prompt *</span>
                    <textarea
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      placeholder={"e.g. Explain how binary trees work\ne.g. Newton's three laws of motion\ne.g. How does React's useEffect hook work?"}
                      rows={5}
                      className="w-full resize-y rounded-lg border border-border-color bg-bg-card p-3 text-sm leading-6 text-text-primary outline-none focus:border-primary"
                    />
                  </label>

                  <label className="block">
                    <span className="block mb-2 text-[11px] font-extrabold uppercase tracking-wide text-text-muted">Title <span className="font-normal normal-case">(optional)</span></span>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Custom title - auto-generated if left empty"
                      className="w-full rounded-lg border border-border-color bg-bg-card p-3 text-sm text-text-primary outline-none focus:border-primary"
                    />
                  </label>

                  <label className="block">
                    <span className="block mb-2 text-[11px] font-extrabold uppercase tracking-wide text-text-muted">Tags <span className="font-normal normal-case">(optional, comma-separated)</span></span>
                    <input
                      value={tags}
                      onChange={(event) => setTags(event.target.value)}
                      placeholder="e.g. DSA, algorithms, interview-prep"
                      className="w-full rounded-lg border border-border-color bg-bg-card p-3 text-sm text-text-primary outline-none focus:border-primary"
                    />
                    {tagPreview.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {tagPreview.map((tag) => (
                          <span key={tag} className="rounded-full border border-primary/30 bg-primary/15 px-2.5 py-1 text-[11px] text-indigo-300">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </label>

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleGenerate}
                    disabled={generating || !prompt.trim()}
                    className={`relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60 ${generating ? 'shimmer-bg' : 'bg-gradient-to-r from-primary to-violet-500 shadow-lg shadow-primary/20'}`}
                  >
                    {generating ? (
                      <>
                        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                        Generating notes...
                      </>
                    ) : (
                      <>📝 Generate Notes</>
                    )}
                  </motion.button>

                  <AnimatePresence>
                    {generatedContent && !generating && (
                      <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="overflow-hidden rounded-xl border border-primary/30"
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-primary/20 bg-primary/10 px-3 py-2">
                          <span className="text-xs font-extrabold text-primary">✅ Notes saved to workspace</span>
                          <button onClick={() => copyText(generatedContent, 'Copied to clipboard!')} className="flex items-center gap-1 rounded-md border border-border-color bg-bg-card px-2 py-1 text-[11px] font-bold text-text-muted">
                            <Copy size={12} /> Copy
                          </button>
                        </div>
                        <div className="max-h-[380px] overflow-y-auto p-4">
                          <MarkdownBlock content={generatedContent} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.section>
              )}

              {activeTab === 'Summarize' && (
                <section className="h-full overflow-y-auto p-4 space-y-4">
                  <div>
                    <h3 className="text-base font-extrabold text-text-primary">Select a resource to summarize</h3>
                    <p className="text-xs text-text-muted mt-1">AI will read the actual file content when possible.</p>
                  </div>

                  <input
                    value={resourceSearch}
                    onChange={(event) => setResourceSearch(event.target.value)}
                    placeholder="Search resources..."
                    className="w-full rounded-xl border border-border-color bg-bg-secondary p-3 text-sm text-text-primary outline-none focus:border-primary"
                  />

                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                    {filteredResources.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border-color p-6 text-center text-sm text-text-muted">
                        No resources in this workspace yet
                      </div>
                    ) : filteredResources.map((resource) => (
                      <button
                        key={resource._id}
                        onClick={() => setSelectedResource(resource)}
                        className={`w-full text-left rounded-xl border p-3 transition-all ${selectedResource?._id === resource._id ? 'border-primary bg-primary/10' : 'border-border-color hover:bg-bg-secondary'}`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-xl">{iconForResource(resource)}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-bold text-text-primary line-clamp-2">{resource.title}</p>
                              {selectedResource?._id === resource._id && <Check size={16} className="text-primary flex-shrink-0" />}
                            </div>
                            <p className="text-xs text-text-muted mt-1">{resource.fileType || resource.type || 'Resource'} · {formatBytes(resource.fileSize)}</p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {(resource.tags || []).slice(0, 2).map((tag) => (
                                <span key={tag} className="rounded-full bg-bg-secondary px-2 py-0.5 text-[10px] text-text-muted">{tag}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleSummarize}
                    disabled={!selectedResource || summarizing}
                    className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {summarizing ? loadingStep : '📄 Summarize This File'}
                  </button>

                  {summary && (
                    <div className="rounded-xl border border-border-color bg-bg-secondary overflow-hidden">
                      <div className="border-b border-border-color px-3 py-3">
                        <p className="text-sm font-extrabold text-text-primary">{iconForResource(selectedResource || undefined)} {summary.resource.title}</p>
                        <p className="text-xs text-text-muted mt-1">Model: {summary.modelUsed}</p>
                      </div>
                      {!summary.contentRead && (
                        <div className="m-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs font-medium text-text-primary">
                          ⚠️ Could not read file content (binary format). Summary is based on filename and tags only.
                        </div>
                      )}
                      {summary.modelUsed === 'local-fallback' && (
                        <div className="m-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs font-medium text-text-primary">
                          AI provider is temporarily unavailable. This is a local fallback summary from available content.
                        </div>
                      )}
                      <div className="max-h-[420px] overflow-y-auto p-3">
                        <MarkdownBlock content={summary.summary} />
                      </div>
                      <div className="flex gap-2 border-t border-border-color p-3">
                        <button onClick={() => copyText(summary.summary, 'Summary copied')} className="flex-1 rounded-lg border border-border-color py-2 text-xs font-bold text-text-primary hover:bg-bg-card">📋 Copy Summary</button>
                        <button onClick={handleSaveSummary} className="flex-1 rounded-lg bg-primary py-2 text-xs font-bold text-white">💾 Save as Resource</button>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {activeTab === 'Chat' && (
                <motion.section
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="h-full min-h-0 flex flex-col"
                >
                  <div className="flex-shrink-0 space-y-3 border-b border-border-color p-4">
                    <div className="flex gap-1 rounded-lg bg-bg-card p-1">
                      {(['resource', 'workspace'] as ChatMode[]).map((item) => (
                        <button
                          key={item}
                          onClick={() => setMode(item)}
                          className={`flex-1 rounded-md px-3 py-2 text-xs font-bold transition-all ${mode === item ? 'bg-primary text-white' : 'text-text-muted hover:text-text-primary'}`}
                        >
                          {item === 'resource' ? '📎 One Resource' : '🏢 Whole Workspace'}
                        </button>
                      ))}
                    </div>

                    {mode === 'resource' && (
                      <>
                        <select
                          value={selectedResourceId}
                          onChange={(event) => {
                            setSelectedResourceId(event.target.value);
                            const found = resources.find((resource) => resource._id === event.target.value);
                            setSelectedResourceTitle(found?.title || '');
                          }}
                          className={`w-full rounded-lg border bg-bg-card p-3 text-sm outline-none ${selectedResourceId ? 'border-primary text-text-primary' : 'border-border-color text-text-muted'}`}
                        >
                          <option value="">Select a resource to chat about...</option>
                          {resources.map((resource) => (
                            <option key={resource._id} value={resource._id}>{iconForResource(resource)} {resource.title}</option>
                          ))}
                        </select>
                        {resources.length === 0 && (
                          <p className="text-center text-[11px] text-text-muted">No resources yet. Upload files or generate notes first.</p>
                        )}
                        {selectedResourceId && (
                          <div className="rounded-lg border border-primary/20 bg-primary/10 p-2.5 text-[11px] text-indigo-300">
                            <div>💬 Chatting about: <strong className="text-primary">{selectedResourceTitle}</strong></div>
                            <div className="mt-1 text-text-muted">
                              {selectedChatResource?.fileType || 'Resource'} · {isLikelyReadable(selectedChatResource) ? 'AI will read the content when possible' : 'AI will use metadata if the file is binary'}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {mode === 'workspace' && (
                      <div className="rounded-lg border border-primary/20 bg-primary/10 p-2.5 text-[11px] leading-5 text-text-muted">
                        💡 AI will search across up to 5 resources in this workspace to answer your question.
                      </div>
                    )}
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
                    {conversation.length === 0 && !chatLoading && (
                      <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-4 text-center">
                        <div className="text-4xl">💬</div>
                        <div>
                          <p className="mb-1 text-sm font-bold text-text-primary">
                            {canChat
                              ? mode === 'resource'
                                ? `Ask anything about "${selectedResourceTitle}"`
                                : 'Ask anything about your workspace'
                              : 'Select a resource to start chatting'}
                          </p>
                          <p className="text-xs text-text-muted">
                            {canChat ? 'AI reads the actual content and answers your questions.' : 'Choose a resource from the dropdown above.'}
                          </p>
                        </div>
                        {canChat && (
                          <div className="flex max-w-[340px] flex-wrap justify-center gap-2">
                            {suggestions.map((suggestion) => (
                              <motion.button
                                key={suggestion}
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => sendMessage(suggestion)}
                                disabled={chatLoading}
                                className="rounded-full border border-primary/35 bg-primary/10 px-3 py-1.5 text-left text-xs text-indigo-300 disabled:opacity-50"
                              >
                                {suggestion}
                              </motion.button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <AnimatePresence initial={false}>
                      {conversation.map((message) => (
                        <motion.div
                          key={message.id}
                          initial={{ opacity: 0, y: 10, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                          className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
                        >
                          <span className="mb-1 px-1 text-[10px] font-extrabold uppercase tracking-wide text-text-muted">
                            {message.role === 'user' ? 'You' : '✨ AI Assistant'}
                          </span>
                          <div
                            className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 break-words ${message.role === 'user' ? 'rounded-br bg-primary text-white' : message.isError ? 'rounded-bl border border-error/30 bg-error/10 text-text-primary' : 'rounded-bl bg-white/5 text-text-primary'}`}
                          >
                            {message.role === 'user' ? message.content : <MarkdownBlock content={message.content} />}
                          </div>
                          {message.role === 'assistant' && !message.isError ? (
                            <div className="mt-1 flex items-center gap-2 px-1 text-[10px] text-text-muted">
                              <span>{formatTime(message.timestamp)}{message.modelUsed ? ` · ${message.modelUsed}` : ''}</span>
                              <button onClick={() => copyText(message.content, 'Copied!')} className="rounded border border-border-color px-1.5 py-0.5 text-[10px] text-text-muted">
                                Copy
                              </button>
                            </div>
                          ) : message.role === 'assistant' && message.isError ? (
                            <div className="mt-1 flex items-center gap-2 px-1 text-[10px] text-text-muted">
                              <span>{formatTime(message.timestamp)}</span>
                              {message.retryQuestion && (
                                <button
                                  onClick={() => sendMessage(message.retryQuestion)}
                                  disabled={chatLoading}
                                  className="rounded border border-border-color px-1.5 py-0.5 text-[10px] text-text-muted disabled:opacity-50"
                                >
                                  Retry
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="mt-1 px-1 text-[10px] text-text-muted">{formatTime(message.timestamp)}</span>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {chatLoading && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-start gap-1">
                        <span className="px-1 text-[10px] font-extrabold uppercase tracking-wide text-text-muted">✨ AI Assistant</span>
                        <div className="flex items-center gap-2 rounded-2xl rounded-bl px-4 py-3 bg-white/5">
                          <span className="thinking-dot" />
                          <span className="thinking-dot" />
                          <span className="thinking-dot" />
                          <span className="ml-1 text-xs font-bold text-text-muted">Reading and thinking...</span>
                        </div>
                      </motion.div>
                    )}
                    <div ref={bottomRef} />
                  </div>

                  {conversation.length > 0 && (
                    <div className="flex flex-shrink-0 justify-end px-4 pt-1">
                      <button onClick={() => setConversation([])} className="text-[11px] text-text-muted hover:text-text-primary">
                        Clear conversation
                      </button>
                    </div>
                  )}

                  <div className="flex flex-shrink-0 items-end gap-2 border-t border-border-color p-4">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={handleChatKeyDown}
                      placeholder={!canChat ? 'Select a resource above to start...' : mode === 'resource' ? 'Ask anything about this resource...' : 'Ask anything about your workspace...'}
                      disabled={!canChat || chatLoading}
                      rows={1}
                      className={`max-h-[100px] flex-1 resize-none rounded-lg border bg-bg-card p-3 text-sm leading-5 text-text-primary outline-none disabled:opacity-50 ${input.trim() ? 'border-primary' : 'border-border-color'}`}
                    />
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => sendMessage()}
                      disabled={!input.trim() || !canChat || chatLoading}
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {chatLoading ? <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> : <Send size={17} />}
                    </motion.button>
                  </div>
                </motion.section>
              )}
            </main>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
