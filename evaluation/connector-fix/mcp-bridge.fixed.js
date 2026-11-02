/**
 * MCP Bridge Module
 *
 * Enables communication between MCP server and the Chrome extension.
 * Primary: WebSocket relay (ws://localhost:7862) for real-time messaging.
 * Fallback: Native host file-based IPC polling when WebSocket is unavailable.
 *
 * The service worker can sleep at any time, dropping the WebSocket.
 * On wake, connectToRelay() reconnects. During disconnection, native
 * messaging polling keeps things working.
 */


// MV3 service workers cannot load import() chunks. Keep this privacy-enforcing
// capture path in the worker's static graph; no work runs until called.
import { captureFact } from './nugget-memory.js';

const NATIVE_HOST_NAME = 'com.browser_memex.oauth_host';
const POLL_INTERVAL_MS = 500;
// Default relay URL. Overridable via chrome.storage.local.relayUrl — set
// from the Settings tab when pairing the extension with a relay that runs
// on a different machine (e.g., a Mac steering the tablet's browser).
export const DEFAULT_WS_RELAY_URL = 'ws://localhost:7862';
const WS_RECONNECT_DELAY_MS = 5000;

async function getRelayUrl() {
  try {
    const { relayUrl } = await chrome.storage.local.get('relayUrl');
    const candidate = typeof relayUrl === 'string' ? relayUrl.trim() : '';
    if (candidate && /^wss?:\/\//i.test(candidate)) return candidate;
  } catch {
    /* storage unavailable — fall through to default */
  }
  return DEFAULT_WS_RELAY_URL;
}

let pollInterval = null;
let isPolling = false;

// WebSocket connection to relay server
let relaySocket = null;
let wsReconnectTimer = null;

// Active MCP sessions
const mcpSessions = new Map();

// Pending get_info requests (waiting for MCP server response)
// Map<requestId, { resolve: Function, reject: Function, timeout: NodeJS.Timeout }>
const pendingGetInfoRequests = new Map();
let getInfoRequestCounter = 0;

// Pending escalation requests (waiting for planning agent guidance)
// Map<requestId, { resolve: Function, timeout: NodeJS.Timeout }>
const pendingEscalateRequests = new Map();
let escalateRequestCounter = 0;

// Pending relay requests (for direct relay responses like read_credentials)
// Map<responseType, { resolve, reject, timeout }>
const pendingRelayRequests = new Map();

// Pending API proxy streams (relay proxies API calls with impersonation headers)
// Map<requestId, { onChunk, resolve, reject, timeout }>
const pendingApiProxies = new Map();
let apiProxyCounter = 0;

// Callbacks for MCP events
let onStartTask = null;
let onSendMessage = null;
let onStopTask = null;
let onScreenshot = null;

// Callbacks for remote tool execution (MCP server-driven agent loop)
let onCreateSession = null;
let onExecuteTool = null;
let onCloseSession = null;

/**
 * Initialize MCP bridge with callbacks.
 * Tries WebSocket relay first, falls back to native host polling.
 */
export function initMcpBridge(callbacks) {
  onStartTask = callbacks.onStartTask;
  onSendMessage = callbacks.onSendMessage;
  onStopTask = callbacks.onStopTask;
  onScreenshot = callbacks.onScreenshot;
  onCreateSession = callbacks.onCreateSession || null;
  onExecuteTool = callbacks.onExecuteTool || null;
  onCloseSession = callbacks.onCloseSession || null;

  console.log('[MCP Bridge] Initialized (lazy — will connect when relay is available)');

  // Don't auto-connect on startup. The relay is only needed when an external
  // MCP client (Claude Code, Cursor) is controlling the browser. Eagerly
  // reconnecting produces noisy WebSocket errors for standalone users.
  // Instead, set up the keepalive alarm which will attempt connection
  // periodically at a relaxed interval (every 2 minutes).
  try {
    chrome.alarms.create('ws-keepalive', { periodInMinutes: 2 });
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'ws-keepalive') {
        // Only reconnect if not already connected
        if (!relaySocket || relaySocket.readyState !== WebSocket.OPEN) {
          connectToRelay();
        }
      }
    });
  } catch (e) {
    console.warn('[MCP Bridge] Alarms API unavailable:', e.message);
  }
}

/**
 * Connect to the WebSocket relay server.
 * On success, stops native polling (WebSocket is faster and push-based).
 * On failure/disconnect, starts native polling as fallback and schedules reconnect.
 */
export async function connectToRelay() {
  // Clear any pending reconnect
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }

  // Don't reconnect if already connected
  if (relaySocket && relaySocket.readyState === WebSocket.OPEN) {
    return;
  }

  const url = await getRelayUrl();
  try {
    relaySocket = new WebSocket(url);
    relaySocket._url = url;

    relaySocket.onopen = () => {
      console.log('[MCP Bridge] WebSocket connected to relay');
      relaySocket._wasConnected = true;

      // Register as the extension client
      relaySocket.send(JSON.stringify({ type: 'register', role: 'extension' }));

      // WebSocket is faster — stop polling to reduce overhead
      stopMcpPolling();
    };

    relaySocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        // Skip registration acknowledgements
        if (message.type === 'registered' || message.type === 'error') {
          if (message.type === 'error') {
            console.warn('[MCP Bridge] Relay error:', message.error);
          }
          return;
        }

        // Check for pending relay request responses (e.g., credentials_result)
        if (pendingRelayRequests.has(message.type)) {
          const pending = pendingRelayRequests.get(message.type);
          clearTimeout(pending.timeout);
          pendingRelayRequests.delete(message.type);
          pending.resolve(message);
          return;
        }

        // Check for API proxy stream events (relay proxies API calls with impersonation headers)
        if (message.type === 'proxy_stream_chunk' || message.type === 'proxy_stream_end' || message.type === 'proxy_api_error') {
          const pending = pendingApiProxies.get(message.requestId);
          if (pending) {
            if (message.type === 'proxy_stream_chunk') {
              if (pending.onChunk) pending.onChunk(message.data);
            } else if (message.type === 'proxy_stream_end') {
              clearTimeout(pending.timeout);
              pendingApiProxies.delete(message.requestId);
              pending.resolve();
            } else if (message.type === 'proxy_api_error') {
              clearTimeout(pending.timeout);
              pendingApiProxies.delete(message.requestId);
              pending.reject(new Error(message.error));
            }
          }
          return;
        }

        // Route through the same command handler as polling
        // Messages from MCP/CLI come in the same format as inbox commands
        // but with mcp_ prefix (e.g., mcp_start_task → start_task)
        const command = normalizeIncomingMessage(message);
        if (command) {
          handleMcpCommand(command);
        }
      } catch (e) {
        console.error('[MCP Bridge] WebSocket message parse error:', e);
      }
    };

    relaySocket.onclose = () => {
      const wasConnected = relaySocket?._wasConnected;
      const userClosed = relaySocket?._userClosed;
      relaySocket = null;

      if (userClosed) {
        // User changed the URL in Settings — reconnectToRelay() will dial
        // the new URL itself; don't schedule a competing reconnect here.
        return;
      }
      if (wasConnected) {
        // Was previously connected — relay went down, try to recover
        console.log('[MCP Bridge] WebSocket disconnected, falling back to polling');
        startMcpPolling();
        wsReconnectTimer = setTimeout(() => {
          connectToRelay();
        }, WS_RECONNECT_DELAY_MS);
      }
      // If never connected, stay quiet — the keepalive alarm will retry later
    };

    relaySocket.onerror = (_err) => {
      // Suppress noisy errors when relay simply isn't running
    };
  } catch (e) {
    // Connection failed — relay not running, stay quiet
  }
}

/**
 * Normalize incoming WebSocket messages to the command format
 * expected by handleMcpCommand().
 *
 * Messages from MCP/CLI arrive with mcp_ prefix (e.g., mcp_start_task).
 * The handleMcpCommand() expects unprefixed types (e.g., start_task).
 */
function normalizeIncomingMessage(message) {
  const { type, ...rest } = message;

  // Map from MCP server message types to bridge command types
  const typeMap = {
    'mcp_start_task': 'start_task',
    'mcp_send_message': 'send_message',
    'mcp_stop_task': 'stop_task',
    'mcp_screenshot': 'screenshot',
    'mcp_get_info_response': 'get_info_response',
    'mcp_escalate_response': 'escalate_response',
    'mcp_poll_results': null, // Not applicable over WebSocket (push-based)
    'llm_request': 'llm_request',
    // Remote tool execution (MCP server-driven agent loop)
    'mcp_create_session': 'create_session',
    'mcp_execute_tool': 'execute_tool',
    'mcp_close_session': 'close_session',
    // Cross-agent memex bridge
    'memex_request': 'memex_request',
  };

  const mappedType = typeMap[type];
  if (mappedType === undefined) {
    // Unknown type — try passing through as-is
    return { type, ...rest };
  }
  if (mappedType === null) {
    // Type should be skipped
    return null;
  }

  return { type: mappedType, ...rest };
}

/**
 * Check if WebSocket relay is connected
 */
export function isRelayConnected() {
  return relaySocket && relaySocket.readyState === WebSocket.OPEN;
}

/**
 * Report the current relay state for the Settings UI:
 *   { url, state: 'connected' | 'connecting' | 'disconnected' }
 * `url` is the URL we'd dial right now (the persisted override, or the
 * default). `state` reflects the live socket, not the persisted URL.
 */
export async function getRelayStatus() {
  const url = await getRelayUrl();
  let state = 'disconnected';
  if (relaySocket) {
    if (relaySocket.readyState === WebSocket.OPEN) state = 'connected';
    else if (relaySocket.readyState === WebSocket.CONNECTING) state = 'connecting';
  }
  return { url, state, defaultUrl: DEFAULT_WS_RELAY_URL };
}

/**
 * Tear down the current relay socket (if any) and re-dial — used by the
 * Settings UI after the user changes the relay URL.
 */
export async function reconnectToRelay() {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  if (relaySocket) {
    try {
      // Mark as user-initiated so onclose doesn't kick off the polling
      // fallback or the auto-reconnect timer.
      relaySocket._userClosed = true;
      relaySocket.close();
    } catch {
      /* already closing */
    }
    relaySocket = null;
  }
  await connectToRelay();
  return getRelayStatus();
}

/**
 * Start polling for MCP commands
 */
export function startMcpPolling() {
  if (pollInterval) return;

  console.log('[MCP Bridge] Starting polling');
  pollInterval = setInterval(pollForCommands, POLL_INTERVAL_MS);
}

/**
 * Stop polling
 */
export function stopMcpPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  console.log('[MCP Bridge] Stopped polling');
}

/**
 * Poll native host for MCP commands
 */
async function pollForCommands() {
  if (isPolling) return;
  isPolling = true;

  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);

    const result = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        port.disconnect();
        resolve(null);
      }, 1000);

      port.onMessage.addListener((message) => {
        clearTimeout(timeout);
        port.disconnect();
        resolve(message);
      });

      port.onDisconnect.addListener(() => {
        clearTimeout(timeout);
        resolve(null);
      });

      port.postMessage({ type: 'poll_mcp_inbox' });
    });

    if (result?.type === 'mcp_commands' && result.commands?.length > 0) {
      for (const cmd of result.commands) {
        await handleMcpCommand(cmd);
      }
    }
  } catch (e) {
    // Silent fail - native host might not be available
  } finally {
    isPolling = false;
  }
}

/**
 * Handle an MCP command from the inbox
 */
async function handleMcpCommand(command) {
  console.log('[MCP Bridge] Received command:', command.type, command.sessionId);

  switch (command.type) {
    case 'start_task':
      if (onStartTask) {
        debugLog('Adding session to mcpSessions', command.sessionId);
        mcpSessions.set(command.sessionId, { status: 'starting', context: command.context });
        debugLog('mcpSessions now has', Array.from(mcpSessions.keys()));
        onStartTask(command.sessionId, command.task, command.url, command.context, command.licenseKey);
      }
      break;

    case 'send_message':
      // Allow send_message even if session is complete/error (for continuation)
      // The service worker will validate if the session actually exists
      if (onSendMessage) {
        onSendMessage(command.sessionId, command.message);
      }
      break;

    case 'stop_task':
      if (onStopTask && mcpSessions.has(command.sessionId)) {
        const shouldRemove = command.remove === true;
        onStopTask(command.sessionId, shouldRemove);
        // Only delete from bridge if removing completely
        if (shouldRemove) {
          mcpSessions.delete(command.sessionId);
        }
      }
      break;

    case 'screenshot':
      if (onScreenshot) {
        onScreenshot(command.sessionId);
      }
      break;

    case 'get_info_response': {
      // Response from MCP server for a get_info request
      const pending = pendingGetInfoRequests.get(command.requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        pending.resolve(command.response);
        pendingGetInfoRequests.delete(command.requestId);
        debugLog('get_info response received', { requestId: command.requestId, response: command.response?.substring(0, 100) });
      } else {
        debugLog('get_info response for unknown request', command.requestId);
      }
      break;
    }

    case 'escalate_response': {
      // Response from planning agent for an escalation request
      const pendingEsc = pendingEscalateRequests.get(command.requestId);
      if (pendingEsc) {
        clearTimeout(pendingEsc.timeout);
        pendingEsc.resolve(command.response);
        pendingEscalateRequests.delete(command.requestId);
        debugLog('escalate response received', { requestId: command.requestId, response: command.response?.substring?.(0, 100) });
      } else {
        debugLog('escalate response for unknown request', command.requestId);
      }
      break;
    }

    case 'llm_request':
      // MCP server requesting LLM completion
      debugLog('llm_request received', { requestId: command.requestId, prompt: command.prompt?.substring(0, 50) });
      handleLLMRequest(command);
      break;

    // Remote tool execution (MCP server-driven agent loop)
    case 'create_session':
      if (onCreateSession) {
        onCreateSession(command.sessionId, command.url);
      }
      break;

    case 'execute_tool':
      if (onExecuteTool) {
        onExecuteTool(command.sessionId, command.toolName, command.toolInput, command.toolUseId);
      }
      break;

    case 'close_session':
      if (onCloseSession) {
        onCloseSession(command.sessionId);
      }
      break;

    case 'memex_request':
      await handleMemexRequest(command);
      break;
  }
}

/**
 * Cross-agent memex bridge.
 *
 * External agents (Claude Code, Cursor, Codex, …) connected via MCP can ask
 * the extension to read or mutate the memex stores. This is the heart of
 * "your memory, schedules, and skills outlive the agent you're using today" —
 * any agent connected to BrowserMemex sees the *same* memex.
 *
 * Wire format:
 *   request:  { type: 'memex_request',  requestId, op, args }
 *   response: { type: 'memex_response', requestId, ok, result | error }
 *
 * `op` is a dotted name into the services table (e.g. `memory.query`,
 * `skills.list`, `tasks.create`). The handler dispatches to the same store
 * methods the side-panel uses, scoped by the currently active profile.
 */
async function handleMemexRequest(cmd) {
  const { requestId, op, args } = cmd ?? {};
  if (!requestId || typeof op !== 'string') return;

  let response;
  try {
    const result = await dispatchMemexOp(op, args ?? {});
    response = { type: 'memex_response', requestId, ok: true, result };
  } catch (e) {
    response = { type: 'memex_response', requestId, ok: false, error: e?.message ?? String(e) };
  }

  sendToNativeHost(response);
}

async function dispatchMemexOp(op, args) {
  // Lazy import to avoid circular deps at module load.
  const {
    services,
    activeProfileId,
    isBooted,
    bootProfiles,
  } = await import('./extension-services.js');

  // Profile reads work even before the heavy SQLite boot completes.
  if (op === 'profile.active') {
    const { profileStore } = await bootProfiles();
    return profileStore.getActive(Date.now());
  }
  if (op === 'profile.list') {
    const { profileStore } = await bootProfiles();
    return profileStore.list();
  }

  if (!isBooted()) {
    throw new Error('memex services not ready');
  }

  const s = services();
  const pid = activeProfileId();

  switch (op) {
    case 'memory.query':
      return s.nuggetStore.query(args.text ?? '', { ...(args.options ?? {}), profileId: pid });
    case 'memory.get':
      return s.nuggetStore.get(args.id);
    case 'memory.count':
      return s.nuggetStore.count(pid);
    case 'memory.write': {
      // Privacy-enforcing capture path. Used by external agents to deposit
      // facts they discover during browsing. Sticks credentials redaction
      // + disabledDomains check between the agent and the store.
      return captureFact({
        kind: args.kind,
        fact: args.fact,
        sourceUrl: args.sourceUrl,
        pageTitle: args.pageTitle,
        agentId: args.agentId ?? 'mcp-agent',
        extractionSessionId: args.sessionId,
        canonicalText: args.canonicalText,
        uiSignals: args.uiSignals,
      });
    }

    case 'skills.list':
      return s.skillStore.list({ ...(args ?? {}), profileId: pid });
    case 'skills.get':
      return s.skillStore.get(args.id);
    case 'skills.getByName':
      return s.skillStore.getByName(args.name, pid);
    case 'skills.run': {
      const { runSkill } = await import('./extension-services.js');
      return runSkill(args.id, args.inputs ?? {});
    }

    case 'tasks.list':
      return s.taskStore.list({ ...(args ?? {}), profileId: pid });
    case 'tasks.get':
      return s.taskStore.get(args.id);
    case 'tasks.create':
      return s.taskStore.create(args, Date.now(), pid);

    default:
      throw new Error(`unknown memex op: ${op}`);
  }
}


// Debug logging - writes to native host which saves to file
function debugLog(msg, data = null) {
  const entry = { time: new Date().toISOString(), msg, data };
  console.log('[MCP Debug]', msg, data || '');
  // Send to native host to write to debug log file
  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    port.postMessage({ type: 'debug_log', entry });
    setTimeout(() => port.disconnect(), 50);
  } catch (_e) { /* Silent fail - native host may not be available */ }
}

/**
 * Send task update to MCP server
 */
export function sendMcpUpdate(sessionId, status, step) {
  debugLog('sendMcpUpdate called', { sessionId, status, step: step?.substring?.(0, 50), hasSes: mcpSessions.has(sessionId), sessions: Array.from(mcpSessions.keys()) });

  if (!mcpSessions.has(sessionId)) {
    debugLog('Session not found, skipping update');
    return;
  }

  mcpSessions.get(sessionId).status = status;

  sendToNativeHost({
    type: 'mcp_task_update',
    sessionId,
    status,
    step,
  });
  debugLog('Update sent to native host');
}

/**
 * Send task completion to MCP server
 * Note: Session is NOT deleted - allows continuation via send_message
 */
export function sendMcpComplete(sessionId, result) {
  if (mcpSessions.has(sessionId)) {
    mcpSessions.get(sessionId).status = 'complete';
  }

  sendToNativeHost({
    type: 'mcp_task_complete',
    sessionId,
    result,
  });
}

/**
 * Send task error to MCP server
 * Note: Session is NOT deleted - allows retry via send_message
 */
export function sendMcpError(sessionId, error) {
  if (mcpSessions.has(sessionId)) {
    mcpSessions.get(sessionId).status = 'error';
  }

  sendToNativeHost({
    type: 'mcp_task_error',
    sessionId,
    error,
  });
}

/**
 * Send screenshot to MCP server
 */
export function sendMcpScreenshot(sessionId, data) {
  sendToNativeHost({
    type: 'mcp_screenshot_result',
    sessionId,
    data,
  });
}

/**
 * Query Mem0 for information via MCP server
 * This is used by the get_info tool to retrieve semantically relevant memories
 *
 * @param {string} sessionId - Session ID to search within
 * @param {string} query - Natural language query
 * @param {number} timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns {Promise<string>} Response from Mem0 search
 */
export function queryMemory(sessionId, query, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const requestId = `get_info_${Date.now()}_${++getInfoRequestCounter}`;

    // Set up timeout
    const timeout = setTimeout(() => {
      pendingGetInfoRequests.delete(requestId);
      // Don't reject on timeout, just return a helpful message
      resolve(`Information lookup timed out. The query "${query}" could not be processed. You can:
1. Skip this field if it's optional
2. Use a reasonable default
3. Mention in your response that you couldn't retrieve this information`);
    }, timeoutMs);

    // Store the pending request
    pendingGetInfoRequests.set(requestId, { resolve, reject, timeout });

    // Send request to MCP server via native host
    sendToNativeHost({
      type: 'mcp_get_info',
      sessionId,
      query,
      requestId,
    });

    debugLog('get_info request sent', { sessionId, query, requestId });
  });
}

/**
 * Send escalation to MCP server (planning agent) for mid-task guidance.
 * Follows the same Promise-bridge pattern as queryMemory().
 *
 * @param {string} sessionId - Session ID
 * @param {string} problem - What the browser agent is stuck on
 * @param {string} whatITried - Approaches already attempted
 * @param {string} whatINeed - What would unblock the agent
 * @param {number} timeoutMs - Timeout (default 3 minutes — accounts for planning LLM call + possible user input)
 * @returns {Promise<string>} Guidance from planning agent
 */
export function sendEscalation(sessionId, problem, whatITried, whatINeed, timeoutMs = 180000) {
  return new Promise((resolve) => {
    const requestId = `escalate_${Date.now()}_${++escalateRequestCounter}`;

    const timeout = setTimeout(() => {
      pendingEscalateRequests.delete(requestId);
      resolve('Escalation timed out. Continue with your best judgment or try a different approach.');
    }, timeoutMs);

    pendingEscalateRequests.set(requestId, { resolve, timeout });

    sendToNativeHost({
      type: 'mcp_escalate',
      sessionId,
      requestId,
      problem,
      whatITried: whatITried || '',
      whatINeed,
    });

    debugLog('escalate request sent', { sessionId, problem, requestId });
  });
}

// Model tier → Anthropic model ID mapping for ccproxy
const CCPROXY_MODEL_MAP = {
  fast: 'claude-haiku-4-5-20251001',
  smart: 'claude-sonnet-4-5-20250929',
  powerful: 'claude-opus-4-5-20251101',
};

const CCPROXY_URL = 'http://127.0.0.1:8000/claude/v1/messages';

/**
 * Handle LLM request from MCP server
 * Routes directly to ccproxy (local Claude Code proxy) via fetch().
 * No native host needed — ccproxy handles credential injection.
 */
async function handleLLMRequest(command) {
  const { requestId, prompt, systemPrompt, maxTokens, modelTier } = command;
  const model = CCPROXY_MODEL_MAP[modelTier] || CCPROXY_MODEL_MAP.smart;

  try {
    debugLog('llm_request via ccproxy', { requestId, model, modelTier: modelTier || 'smart' });

    const body = {
      model,
      max_tokens: maxTokens || 2000,
      messages: [{ role: 'user', content: prompt }],
      ...(systemPrompt ? { system: systemPrompt } : {}),
    };

    const response = await fetch(CCPROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ccproxy ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const result = await response.json();

    // Extract text content from Anthropic Messages API response
    const content = result.content?.find(b => b.type === 'text')?.text || '';

    sendToNativeHost({
      type: 'mcp_llm_response',
      requestId,
      content,
      usage: result.usage,
    });

    debugLog('llm_request completed', { requestId, contentLength: content.length });
  } catch (error) {
    console.error('[MCP Bridge] LLM request failed:', error);

    sendToNativeHost({
      type: 'mcp_llm_response',
      requestId,
      error: error.message || 'LLM request failed',
    });

    debugLog('llm_request failed', { requestId, error: error.message });
  }
}

/**
 * Send session_created result to MCP server
 */
export function sendSessionCreated(sessionId, tabId, windowId, error = null) {
  sendToNativeHost({
    type: 'mcp_session_created',
    sessionId,
    tabId,
    windowId,
    error,
  });
}

/**
 * Send tool_result to MCP server
 */
export function sendToolResult(sessionId, toolUseId, content, error = null) {
  sendToNativeHost({
    type: 'mcp_tool_result',
    sessionId,
    toolUseId,
    content,
    error,
  });
}

/**
 * Send session_closed to MCP server
 */
export function sendSessionClosed(sessionId) {
  sendToNativeHost({
    type: 'mcp_session_closed',
    sessionId,
  });
}

/**
 * Get MCP session data (including context)
 */
export function getMcpSession(sessionId) {
  return mcpSessions.get(sessionId);
}

/**
 * Send message to MCP server/CLI.
 * Routes through WebSocket relay when connected, falls back to native host.
 */
function sendToNativeHost(message) {
  // Try WebSocket first (real-time, no file I/O)
  if (relaySocket && relaySocket.readyState === WebSocket.OPEN) {
    try {
      // Normalize outgoing message types for the relay
      // The relay broadcasts to all MCP/CLI consumers
      const wsMessage = normalizeOutgoingMessage(message);
      relaySocket.send(JSON.stringify(wsMessage));
      return;
    } catch (e) {
      console.warn('[MCP Bridge] WebSocket send failed, falling back to native host:', e.message);
    }
  }

  // Fall back to native host (file-based IPC)
  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    port.postMessage(message);
    setTimeout(() => port.disconnect(), 100);
  } catch (e) {
    console.error('[MCP Bridge] Send error:', e);
  }
}

/**
 * Normalize outgoing messages from extension format to the format
 * expected by MCP server/CLI consumers.
 *
 * Native host bridge translates mcp_task_update → task_update etc.
 * For WebSocket, we do this translation here.
 */
function normalizeOutgoingMessage(message) {
  const { type, ...rest } = message;

  // Map from extension message types to consumer-expected types
  const typeMap = {
    'mcp_task_update': 'task_update',
    'mcp_task_complete': 'task_complete',
    'mcp_task_error': 'task_error',
    'mcp_screenshot_result': 'screenshot',
    'mcp_get_info': 'mcp_get_info',
    'mcp_escalate': 'mcp_escalate',
    'mcp_llm_response': 'llm_response',
    // Remote tool execution responses
    'mcp_session_created': 'session_created',
    'mcp_tool_result': 'tool_result',
    'mcp_session_closed': 'session_closed',
  };

  const mappedType = typeMap[type] || type;
  return { type: mappedType, ...rest };
}

/**
 * Check if a session is an MCP session
 */
export function isMcpSession(sessionId) {
  return mcpSessions.has(sessionId);
}

/**
 * Get all active MCP sessions
 */
export function getMcpSessions() {
  return Array.from(mcpSessions.keys());
}

/**
 * Send a request directly to the relay and wait for a response.
 * Used for relay-handled operations like credential reading.
 *
 * @param {Object} message - Message to send to the relay
 * @param {string} responseType - Expected response message type
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Object>} Response message from the relay
 */
export function relayRequest(message, responseType, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (!relaySocket || relaySocket.readyState !== WebSocket.OPEN) {
      reject(new Error('Relay not connected'));
      return;
    }

    const timeout = setTimeout(() => {
      pendingRelayRequests.delete(responseType);
      reject(new Error('Relay request timed out'));
    }, timeoutMs);

    pendingRelayRequests.set(responseType, { resolve, reject, timeout });
    relaySocket.send(JSON.stringify(message));
  });
}

/**
 * Proxy an API call through the relay server.
 * The relay adds Claude Code impersonation headers (user-agent, x-app)
 * that browsers can't set due to CORS restrictions.
 *
 * @param {string} url - API endpoint URL
 * @param {string} body - Serialized JSON request body
 * @param {Function} onChunk - Called with each SSE event object
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<void>} Resolves when stream completes
 */
export function proxyApiCall(url, body, onChunk, timeoutMs = 150000) {
  return new Promise((resolve, reject) => {
    if (!relaySocket || relaySocket.readyState !== WebSocket.OPEN) {
      reject(new Error('Relay not connected'));
      return;
    }

    const requestId = `proxy_${Date.now()}_${++apiProxyCounter}`;

    const timeout = setTimeout(() => {
      pendingApiProxies.delete(requestId);
      reject(new Error('API proxy request timed out'));
    }, timeoutMs);

    pendingApiProxies.set(requestId, { onChunk, resolve, reject, timeout });

    relaySocket.send(JSON.stringify({
      type: 'proxy_api_call',
      requestId,
      url,
      body,
    }));
  });
}
