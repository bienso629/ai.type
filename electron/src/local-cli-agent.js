'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

let edgeTts = null;
try {
    edgeTts = require('./edge-tts-v2');
} catch (_) {
    edgeTts = null;
}

const activeProcesses = new Map(); // requestId -> { child, engine, aborted, tempDir }
const sessionMap = new Map(); // conversationKey -> { engine, sessionId, updatedAt }
let cliDetectCache = null;
let cliDetectCacheAt = 0;
const CLI_DETECT_TTL_MS = 15000;

function getAgentWorkspaceDir() {
    const dir = path.join(os.homedir(), 'Documents', 'ai.type', 'agent-workspace');
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    } catch (_) {}
    return dir;
}

function appendCliLog(line) {
    try {
        const logPath = path.join(getAgentWorkspaceDir(), 'local-cli-agent.log');
        const ts = new Date().toISOString();
        fs.appendFileSync(logPath, `[${ts}] ${line}\n`, 'utf8');
    } catch (_) {}
}

/**
 * Mở rộng PATH cho tiến trình Electron GUI (thường bị thiếu ~/.local/bin, nvm, homebrew...).
 */
function buildEnrichedPath() {
    const home = os.homedir();
    const sep = process.platform === 'win32' ? ';' : ':';
    const existing = (process.env.PATH || '').split(sep).filter(Boolean);
    const extra = [];

    if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
        const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
        extra.push(
            path.join(appData, 'npm'),
            path.join(localAppData, 'Programs', 'agy'),
            path.join(localAppData, 'Programs', 'claude'),
            path.join(home, '.local', 'bin'),
            path.join(home, '.claude', 'local')
        );
    } else {
        extra.push(
            path.join(home, '.local', 'bin'),
            path.join(home, '.claude', 'local'),
            path.join(home, '.npm-global', 'bin'),
            path.join(home, '.volta', 'bin'),
            path.join(home, '.bun', 'bin'),
            '/opt/homebrew/bin',
            '/usr/local/bin',
            '/usr/bin',
            '/bin'
        );

        // Quét các phiên bản Node quản lý bởi NVM (ưu tiên bản mới nhất trước)
        try {
            const nvmDir = path.join(home, '.nvm', 'versions', 'node');
            if (fs.existsSync(nvmDir)) {
                const versions = fs.readdirSync(nvmDir).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
                for (const v of versions) {
                    const binDir = path.join(nvmDir, v, 'bin');
                    if (fs.existsSync(binDir)) extra.push(binDir);
                }
            }
        } catch (_) {}
    }

    const merged = [];
    const seen = new Set();
    for (const p of [...existing, ...extra]) {
        if (!p || seen.has(p)) continue;
        seen.add(p);
        merged.push(p);
    }
    return merged.join(sep);
}

function buildChildEnv() {
    const env = { ...process.env };
    env.PATH = buildEnrichedPath();
    // Tránh lỗi nested-session khi ứng dụng được chạy từ bên trong một phiên CLI khác
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;
    env.NO_COLOR = '1';
    env.FORCE_COLOR = '0';
    return env;
}

function isExecutableFile(filePath) {
    try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) return false;
        if (process.platform === 'win32') return true;
        fs.accessSync(filePath, fs.constants.X_OK);
        return true;
    } catch (_) {
        return false;
    }
}

function resolveCliBinary(cmdName) {
    const sep = process.platform === 'win32' ? ';' : ':';
    const dirs = buildEnrichedPath().split(sep).filter(Boolean);
    const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];

    for (const dir of dirs) {
        for (const ext of exts) {
            const candidate = path.join(dir, cmdName + ext);
            if (isExecutableFile(candidate)) {
                return candidate;
            }
        }
    }
    return null;
}

function probeCliVersion(binaryPath, cmdName) {
    return new Promise((resolve) => {
        if (!binaryPath) return resolve('');
        const isWinScript = process.platform === 'win32' && /\.(cmd|bat)$/i.test(binaryPath);
        const args = cmdName === 'agy' ? ['--version'] : ['--version'];
        try {
            cp.execFile(
                binaryPath,
                args,
                { timeout: 3000, env: buildChildEnv(), shell: isWinScript, encoding: 'utf8' },
                (err, stdout, stderr) => {
                    const text = String(stdout || stderr || '').trim();
                    if (!text) return resolve('');
                    const firstLine = text.split(/\r?\n/)[0].trim();
                    resolve(firstLine.slice(0, 64));
                }
            );
        } catch (_) {
            resolve('');
        }
    });
}

async function detectLocalClis(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cliDetectCache && (now - cliDetectCacheAt) < CLI_DETECT_TTL_MS) {
        return cliDetectCache;
    }

    const agyPath = resolveCliBinary('agy');
    const claudePath = resolveCliBinary('claude');

    const [agyVersion, claudeVersion] = await Promise.all([
        agyPath ? probeCliVersion(agyPath, 'agy') : Promise.resolve(''),
        claudePath ? probeCliVersion(claudePath, 'claude') : Promise.resolve('')
    ]);

    const result = {
        agy: {
            installed: !!agyPath,
            path: agyPath,
            version: agyVersion || ''
        },
        claude: {
            installed: !!claudePath,
            path: claudePath,
            version: claudeVersion || ''
        },
        recommended: agyPath ? 'agy' : (claudePath ? 'claude' : null)
    };

    cliDetectCache = result;
    cliDetectCacheAt = now;
    return result;
}

/**
 * Chuẩn hóa tên model sang định dạng tương thích với từng CLI cục bộ.
 * Trả về chuỗi rỗng nếu nên để CLI tự dùng model mặc định (tránh lỗi unknown model).
 */
function normalizeModelForEngine(rawModel, engine) {
    const m = String(rawModel || '').trim();
    if (!m || m === 'default' || m === 'agent' || /^glm-/i.test(m)) {
        return '';
    }

    if (engine === 'agy') {
        // Ánh xạ alias phổ biến hoặc tên model cũ sang model thực của agy
        const lower = m.toLowerCase();
        if (lower === 'gemini-3.8-flash' || lower === 'gemini-3.7-flash') return 'gemini-3.8-flash-medium';
        if (lower === 'gemini-3.7-flash-low' || lower === 'gemini-3.6-flash-low') return 'gemini-3.8-flash-low';
        if (lower === 'gemini-3.7-flash-medium' || lower === 'gemini-3.6-flash-medium') return 'gemini-3.8-flash-medium';
        if (lower === 'gemini-3.7-flash-high' || lower === 'gemini-3.6-flash-high') return 'gemini-3.8-flash-high';
        if (lower === 'gemini-3.5-pro' || lower === 'gemini-3.1-pro') return 'gemini-4-neon-medium';
        if (lower === 'sonnet') return 'claude-sonnet-5-5-medium';
        if (lower === 'opus' || lower === 'fable') return 'claude-opus-5-5-medium';
        if (lower === 'haiku') return 'gemini-3.8-flash-low';
        // Nếu tên model hợp lệ dạng agy (gemini-*, claude-*-low/medium/high, gpt-*)
        if (/^(gemini-|claude-.*-(low|medium|high)$|gpt-)/i.test(lower)) {
            return m;
        }
        return '';
    }

    if (engine === 'claude') {
        const lower = m.toLowerCase();
        if (['sonnet', 'opus', 'haiku', 'fable'].includes(lower)) return lower;
        if (lower.startsWith('claude-opus')) return 'opus';
        if (lower.startsWith('claude-sonnet')) return 'sonnet';
        if (lower.startsWith('claude-haiku')) return 'haiku';
        if (lower.startsWith('claude-fable')) return 'fable';
        if (lower.startsWith('claude-')) return m;
        // Model Gemini/GPT không chạy trên Claude CLI -> dùng mặc định của Claude CLI
        return '';
    }

    return '';
}

function isClaudeAliasModel(rawModel) {
    const lower = String(rawModel || '').trim().toLowerCase();
    return ['sonnet', 'opus', 'haiku', 'fable'].includes(lower) ||
        (lower.startsWith('claude-') && !/-(low|medium|high)$/.test(lower));
}

function sanitizeFileName(name, fallbackIdx) {
    const base = path.basename(String(name || `attachment_${fallbackIdx}`)).replace(/[^\w.\-]/g, '_');
    return base || `attachment_${fallbackIdx}`;
}

function writeAttachmentsToTempDir(requestId, files) {
    if (!Array.isArray(files) || files.length === 0) return { tempDir: null, savedPaths: [] };
    const tempDir = path.join(os.tmpdir(), 'ai-type-cli-agent', requestId);
    fs.mkdirSync(tempDir, { recursive: true });
    const savedPaths = [];
    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!f || !f.base64) continue;
        let b64 = String(f.base64);
        if (b64.startsWith('data:')) {
            const commaIdx = b64.indexOf(',');
            if (commaIdx >= 0) b64 = b64.slice(commaIdx + 1);
        }
        const safeName = sanitizeFileName(f.fileName, i);
        const fullPath = path.join(tempDir, `${i}_${safeName}`);
        fs.writeFileSync(fullPath, Buffer.from(b64, 'base64'));
        savedPaths.push({
            path: fullPath,
            fileName: f.fileName || safeName,
            mimeType: f.mimeType || 'application/octet-stream'
        });
    }
    return { tempDir, savedPaths };
}

function cleanupTempDir(tempDir) {
    if (!tempDir) return;
    try {
        fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
}

function stripMarkdownForTts(text) {
    return String(text || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`]*`/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[#*_~>|]/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function xmlEscapeSimple(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function createStreamingTtsEmitter(sender, requestId, ttsVoice, ttsRate, skipTTS) {
    const isEdgeVoice = !skipTTS && edgeTts && typeof edgeTts.synthesizeChunk === 'function' &&
        ttsVoice && ttsVoice !== 'none' && ttsVoice !== 'local' && ttsVoice !== 'google';

    let buffer = '';
    let accumulated = '';
    let chain = Promise.resolve();
    let stopped = false;

    const enqueueSentence = (sentence) => {
        if (!isEdgeVoice || stopped) return;
        const clean = stripMarkdownForTts(sentence);
        if (!clean || clean.length < 2) return;
        chain = chain.then(async () => {
            if (stopped || sender.isDestroyed()) return;
            try {
                const escaped = xmlEscapeSimple(clean);
                const res = await edgeTts.synthesizeChunk(
                    escaped,
                    ttsVoice,
                    ttsRate || '+0%',
                    '+0%',
                    '+0Hz',
                    0
                );
                if (!stopped && !sender.isDestroyed() && res && res.audio && res.audio.length > 0) {
                    sender.send('ai-agent:cli-stream', {
                        requestId,
                        type: 'audio',
                        audioBase64: res.audio.toString('base64')
                    });
                }
            } catch (_) {
                // Bỏ qua lỗi TTS cục bộ để không ảnh hưởng luồng phản hồi văn bản
            }
        });
    };

    const drain = (force = false) => {
        if (!isEdgeVoice || stopped) return;
        while (true) {
            const match = buffer.match(/^([\s\S]*?[.?!:\n]+)([\s\S]*)$/);
            if (match) {
                const sentence = match[1].trim();
                buffer = match[2] || '';
                enqueueSentence(sentence);
            } else if (force && buffer.trim()) {
                const rest = buffer.trim();
                buffer = '';
                enqueueSentence(rest);
                break;
            } else {
                break;
            }
        }
    };

    return {
        push(delta) {
            if (!isEdgeVoice || stopped || !delta) return;
            accumulated += delta;
            const backticks = (accumulated.match(/```/g) || []).length;
            const insideCode = backticks % 2 !== 0;
            const looksJson = accumulated.trimStart().startsWith('{') || accumulated.trimStart().startsWith('[');
            if (insideCode || looksJson) return;
            buffer += delta;
            drain(false);
        },
        flush() {
            if (!isEdgeVoice || stopped) return;
            const looksJson = accumulated.trimStart().startsWith('{') || accumulated.trimStart().startsWith('[');
            if (!looksJson) drain(true);
        },
        stop() {
            stopped = true;
            buffer = '';
        }
    };
}

function buildComposedPrompt({ prompt, systemInstructions, historyText, savedPaths, includeSystemInPrompt, includeHistory }) {
    const sections = [];
    if (includeSystemInPrompt && systemInstructions && systemInstructions.trim()) {
        sections.push(`[SYSTEM INSTRUCTIONS]\n${systemInstructions.trim()}\n[/SYSTEM INSTRUCTIONS]`);
    }
    if (includeHistory && historyText && historyText.trim()) {
        sections.push(`[CONVERSATION HISTORY]\n${historyText.trim()}\n[/CONVERSATION HISTORY]`);
    }
    if (Array.isArray(savedPaths) && savedPaths.length > 0) {
        const listText = savedPaths
            .map((p, idx) => `- Tệp #${idx + 1} (${p.fileName}, ${p.mimeType}): ${p.path}`)
            .join('\n');
        sections.push(
            `[ATTACHED FILES]\nNgười dùng đã đính kèm các tệp sau trên máy cục bộ. Hãy đọc/xem trực tiếp các tệp này bằng công cụ đọc tệp trước khi trả lời (không chạy lệnh shell hay khám phá thư mục khác):\n${listText}\n[/ATTACHED FILES]`
        );
    }
    sections.push(String(prompt || '').trim() || 'Xin chào');
    return sections.join('\n\n');
}

function spawnSingleCliRun({
    engine,
    binaryPath,
    requestId,
    sender,
    prompt,
    systemInstructions,
    historyText,
    model,
    disableThinking,
    conversationKey,
    resumeSessionId,
    tempDir,
    savedPaths,
    ttsEmitter,
    timeoutMs
}) {
    return new Promise((resolve) => {
        const cwd = getAgentWorkspaceDir();
        const env = buildChildEnv();
        const isWinScript = process.platform === 'win32' && /\.(cmd|bat)$/i.test(binaryPath);
        const normalizedModel = normalizeModelForEngine(model, engine);

        let args = [];
        let stdinText = null;
        let promptFileDir = tempDir;

        if (engine === 'agy') {
            const fullPrompt = buildComposedPrompt({
                prompt,
                systemInstructions,
                historyText,
                savedPaths,
                includeSystemInPrompt: !resumeSessionId,
                includeHistory: !resumeSessionId && !!historyText
            });

            args.push('--output-format', 'stream-json');
            args.push('--disable-slash-commands');
            args.push('--dangerously-skip-permissions');
            let effectiveModel = normalizedModel;
            if (disableThinking && effectiveModel && /-(medium|high|xhigh)$/i.test(effectiveModel)) {
                effectiveModel = effectiveModel.replace(/-(medium|high|xhigh)$/i, '-low');
            }
            if (effectiveModel) {
                args.push('--model', effectiveModel);
            } else if (disableThinking) {
                args.push('--effort', 'low');
            }
            if (resumeSessionId) {
                args.push('--conversation', resumeSessionId);
            }
            if (timeoutMs > 0) {
                args.push('--print-timeout', `${Math.max(30, Math.ceil(timeoutMs / 1000))}s`);
            }

            // Nếu prompt quá dài (> 24KB), ghi ra file tạm để tránh vượt giới hạn đối số OS
            let promptArgValue = fullPrompt;
            if (Buffer.byteLength(fullPrompt, 'utf8') > 24000) {
                if (!promptFileDir) {
                    promptFileDir = path.join(os.tmpdir(), 'ai-type-cli-agent', requestId);
                    fs.mkdirSync(promptFileDir, { recursive: true });
                }
                const promptFilePath = path.join(promptFileDir, 'prompt_input.txt');
                fs.writeFileSync(promptFilePath, fullPrompt, 'utf8');
                promptArgValue = `Hãy đọc toàn bộ hướng dẫn và yêu cầu trong tệp "${promptFilePath}" bằng công cụ đọc tệp, sau đó thực hiện chính xác và trả lời trực tiếp kết quả cuối cùng.`;
            }

            if (promptFileDir) {
                args.push('--add-dir', promptFileDir);
            }
            args.push(`-p=${promptArgValue}`);
        } else {
            // Claude CLI
            const useAppendSystem = !resumeSessionId && systemInstructions && Buffer.byteLength(systemInstructions, 'utf8') <= 16000;
            const fullPrompt = buildComposedPrompt({
                prompt,
                systemInstructions,
                historyText,
                savedPaths,
                includeSystemInPrompt: !resumeSessionId && !useAppendSystem,
                includeHistory: !resumeSessionId && !!historyText
            });

            args.push('-p');
            args.push('--output-format', 'stream-json');
            args.push('--verbose');
            args.push('--include-partial-messages');
            args.push('--permission-mode', 'bypassPermissions');
            args.push('--disable-slash-commands');
            if (normalizedModel) {
                args.push('--model', normalizedModel);
            }
            if (useAppendSystem) {
                args.push('--append-system-prompt', systemInstructions.trim());
            }
            if (resumeSessionId) {
                args.push('--resume', resumeSessionId);
            }
            if (promptFileDir) {
                args.push('--add-dir', promptFileDir);
            }
            stdinText = fullPrompt;
        }

        let child;
        try {
            child = cp.spawn(binaryPath, args, {
                cwd,
                env,
                shell: isWinScript,
                stdio: ['pipe', 'pipe', 'pipe']
            });
        } catch (spawnErr) {
            return resolve({
                success: false,
                engine,
                model: normalizedModel,
                error: `Không thể khởi chạy ${engine.toUpperCase()} CLI: ${spawnErr.message}`,
                retriableFallback: true
            });
        }

        const record = { child, engine, aborted: false, tempDir: promptFileDir };
        activeProcesses.set(requestId, record);

        if (stdinText !== null) {
            try {
                child.stdin.write(stdinText, 'utf8');
                child.stdin.end();
            } catch (_) {}
        } else {
            try {
                child.stdin.end();
            } catch (_) {}
        }

        let stdoutBuffer = '';
        let stderrText = '';
        let streamedText = '';
        let finalResultText = '';
        let detectedConversationId = resumeSessionId || '';
        let detectedError = '';
        let settled = false;

        const emitDelta = (chunk) => {
            if (!chunk || record.aborted) return;
            streamedText += chunk;
            if (ttsEmitter) ttsEmitter.push(chunk);
            if (sender && !sender.isDestroyed()) {
                sender.send('ai-agent:cli-stream', {
                    requestId,
                    type: 'delta',
                    content: chunk,
                    engine,
                    conversationId: detectedConversationId || undefined
                });
            }
        };

        let receivedResultEvent = false;
        const scheduleGracefulKill = () => {
            setTimeout(() => {
                try {
                    if (child && !child.killed && child.exitCode === null) {
                        child.kill('SIGTERM');
                        setTimeout(() => {
                            try {
                                if (child && !child.killed && child.exitCode === null) {
                                    child.kill('SIGKILL');
                                }
                            } catch (_) {}
                        }, 400);
                    }
                } catch (_) {}
            }, 250);
        };

        const handleJsonLine = (line) => {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('{')) return;
            let obj;
            try {
                obj = JSON.parse(trimmed);
            } catch (_) {
                return;
            }

            if (engine === 'agy') {
                if (obj.conversation_id) {
                    detectedConversationId = obj.conversation_id;
                }
                if (obj.event === 'step_update' && obj.step_update) {
                    const su = obj.step_update;
                    if (su.conversation_id) detectedConversationId = su.conversation_id;
                    if (su.step_type === 'agent_response' && typeof su.text_delta === 'string' && su.text_delta.length > 0) {
                        emitDelta(su.text_delta);
                    }
                } else if (obj.event === 'result' && obj.result) {
                    const r = obj.result;
                    if (r.conversation_id) detectedConversationId = r.conversation_id;
                    if (r.status === 'ERROR' || r.error) {
                        detectedError = String(r.error || r.response || 'AGY CLI xử lý thất bại');
                    }
                    if (typeof r.response === 'string' && r.response.length > 0) {
                        finalResultText = r.response;
                    }
                    receivedResultEvent = true;
                    scheduleGracefulKill();
                    finish(detectedError ? 1 : 0);
                }
            } else {
                // Claude CLI stream-json
                if (obj.session_id) {
                    detectedConversationId = obj.session_id;
                }
                if (obj.type === 'stream_event' && obj.event) {
                    const ev = obj.event;
                    if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta' && typeof ev.delta.text === 'string') {
                        emitDelta(ev.delta.text);
                    }
                } else if (obj.type === 'assistant' && obj.message) {
                    if (obj.is_api_error_message || obj.error) {
                        const errBlocks = Array.isArray(obj.message.content)
                            ? obj.message.content.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n')
                            : '';
                        detectedError = errBlocks || String(obj.error || 'Claude CLI lỗi xác thực hoặc API');
                    } else if (!streamedText && Array.isArray(obj.message.content)) {
                        const textBlocks = obj.message.content
                            .filter((b) => b && b.type === 'text' && b.text)
                            .map((b) => b.text)
                            .join('');
                        if (textBlocks) emitDelta(textBlocks);
                    }
                } else if (obj.type === 'result') {
                    if (obj.is_error) {
                        detectedError = String(obj.result || detectedError || 'Claude CLI xử lý thất bại');
                    } else if (typeof obj.result === 'string' && obj.result.length > 0) {
                        finalResultText = obj.result;
                    }
                    receivedResultEvent = true;
                    scheduleGracefulKill();
                    finish(detectedError ? 1 : 0);
                }
            }
        };

        const timer = setTimeout(() => {
            if (settled) return;
            detectedError = `${engine.toUpperCase()} CLI phản hồi quá thời gian cho phép (${Math.round(timeoutMs / 1000)}s).`;
            try { child.kill('SIGTERM'); } catch (_) {}
            setTimeout(() => {
                try { child.kill('SIGKILL'); } catch (_) {}
            }, 600);
        }, timeoutMs);

        child.stdout.on('data', (chunk) => {
            stdoutBuffer += chunk.toString('utf8');
            const lines = stdoutBuffer.split(/\r?\n/);
            stdoutBuffer = lines.pop() || '';
            for (const line of lines) {
                handleJsonLine(line);
            }
        });

        child.stderr.on('data', (chunk) => {
            const s = chunk.toString('utf8');
            stderrText += s;
            if (stderrText.length > 8000) stderrText = stderrText.slice(-8000);
        });

        const finish = (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            activeProcesses.delete(requestId);

            if (!receivedResultEvent && stdoutBuffer.trim()) {
                handleJsonLine(stdoutBuffer);
            }

            if (record.aborted) {
                return resolve({
                    success: false,
                    engine,
                    model: normalizedModel,
                    aborted: true,
                    error: 'Đã hủy yêu cầu AI Agent cục bộ.'
                });
            }

            const finalText = (finalResultText || streamedText || '').trim();
            if (detectedError || (code !== 0 && !finalText)) {
                let errMsg = detectedError || stderrText.trim() || `${engine.toUpperCase()} CLI thoát với mã lỗi ${code}`;
                if (/Not logged in|authentication_failed|Please run \/login/i.test(errMsg)) {
                    errMsg = `Claude CLI chưa đăng nhập trên máy cục bộ. Hãy mở Terminal chạy "claude" rồi gõ "/login" (hoặc chuyển sang AGY CLI).`;
                }
                const retriableFallback = !streamedText && (
                    /not logged in|authentication|unauthorized|command not found|enoent|unknown model|invalid model/i.test(errMsg) ||
                    code !== 0
                );
                return resolve({
                    success: false,
                    engine,
                    model: normalizedModel,
                    error: errMsg,
                    retriableFallback
                });
            }

            // Nếu CLI chỉ trả kết quả trong event result (không có delta trước đó), đẩy 1 lần cho UI
            if (!streamedText && finalText && sender && !sender.isDestroyed()) {
                if (ttsEmitter) ttsEmitter.push(finalText);
                sender.send('ai-agent:cli-stream', {
                    requestId,
                    type: 'delta',
                    content: finalText,
                    engine,
                    conversationId: detectedConversationId || undefined
                });
            }

            if (conversationKey && detectedConversationId) {
                sessionMap.set(conversationKey, {
                    engine,
                    sessionId: detectedConversationId,
                    updatedAt: Date.now()
                });
            }

            return resolve({
                success: true,
                engine,
                model: normalizedModel,
                result: finalText,
                conversationId: detectedConversationId || undefined
            });
        };

        child.on('error', (err) => {
            detectedError = `Lỗi chạy ${engine.toUpperCase()} CLI: ${err.message}`;
            finish(1);
        });

        child.on('close', (code) => {
            finish(code);
        });
    });
}

async function runLocalCliAgent(event, payload = {}) {
    const requestId = String(payload.requestId || `cli_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
    const preferredEngine = String(payload.engine || 'auto').toLowerCase();
    const rawModel = String(payload.model || '').trim();
    const conversationKey = String(payload.conversationKey || '').trim();
    const isFirstMessage = payload.isFirstMessage !== false;
    const timeoutMs = Math.max(30000, Math.min(300000, Number(payload.timeoutMs) || 180000));

    const clis = await detectLocalClis(false);
    const available = [];
    if (clis.agy.installed) available.push('agy');
    if (clis.claude.installed) available.push('claude');

    if (available.length === 0) {
        return {
            success: false,
            error: 'Không tìm thấy AGY CLI (agy) hoặc Claude CLI (claude) trên máy cục bộ. Vui lòng cài đặt agy hoặc claude CLI và bấm "Kiểm tra lại CLI" trong Cài đặt -> Plugins -> AI Agent.'
        };
    }

    // Xác định thứ tự thử nghiệm CLI theo cấu hình người dùng
    let engineOrder = [];
    if (preferredEngine === 'agy') {
        if (!clis.agy.installed) {
            return {
                success: false,
                error: 'Đã chọn AGY CLI nhưng không tìm thấy lệnh "agy" trên máy cục bộ. Vui lòng cài đặt AGY CLI hoặc chuyển sang Claude CLI.'
            };
        }
        engineOrder = ['agy'];
    } else if (preferredEngine === 'claude') {
        if (!clis.claude.installed) {
            return {
                success: false,
                error: 'Đã chọn Claude CLI nhưng không tìm thấy lệnh "claude" trên máy cục bộ. Vui lòng cài đặt Claude CLI hoặc chuyển sang AGY CLI.'
            };
        }
        engineOrder = ['claude'];
    } else {
        // auto: nếu chọn alias riêng của Claude CLI (sonnet/opus/haiku/fable) và có claude -> ưu tiên claude rồi dự phòng agy; ngược lại ưu tiên agy rồi dự phòng claude
        if (isClaudeAliasModel(rawModel) && clis.claude.installed) {
            engineOrder = clis.agy.installed ? ['claude', 'agy'] : ['claude'];
        } else {
            engineOrder = clis.agy.installed
                ? (clis.claude.installed ? ['agy', 'claude'] : ['agy'])
                : ['claude'];
        }
    }

    if (conversationKey && isFirstMessage) {
        sessionMap.delete(conversationKey);
    }

    const { tempDir, savedPaths } = writeAttachmentsToTempDir(requestId, payload.files);
    const ttsEmitter = createStreamingTtsEmitter(
        event.sender,
        requestId,
        payload.ttsVoice,
        payload.ttsRate,
        payload.skipTTS === true
    );

    const disableThinking = payload.disableThinking === true;
    const tStart = Date.now();
    appendCliLog(`START req=${requestId} pref=${preferredEngine} rawModel=${rawModel || 'default'} order=${engineOrder.join(',')} files=${Array.isArray(payload.files) ? payload.files.length : 0} disableThinking=${disableThinking}`);

    let lastRes = null;
    try {
        for (let i = 0; i < engineOrder.length; i++) {
            const eng = engineOrder[i];
            const binaryPath = eng === 'agy' ? clis.agy.path : clis.claude.path;
            const prevSession = conversationKey && !isFirstMessage ? sessionMap.get(conversationKey) : null;
            const resumeSessionId = (prevSession && prevSession.engine === eng) ? prevSession.sessionId : '';

            // Nếu agy gặp lỗi quá tải (503 / unavailable / quota) trên model Gemini, tự động đổi sang model dự phòng trong agy (Claude Sonnet 5.5 / Gemini Flash Low)
            const primaryModel = rawModel;
            const agyBackupModels = eng === 'agy'
                ? ['claude-sonnet-5-5-medium', 'gemini-3.8-flash-low'].filter((bm) => bm !== normalizeModelForEngine(primaryModel, 'agy'))
                : [];
            const modelAttempts = [primaryModel, ...agyBackupModels];

            let res = null;
            for (let mIdx = 0; mIdx < modelAttempts.length; mIdx++) {
                const attemptModel = modelAttempts[mIdx];
                const curResumeId = mIdx === 0 ? resumeSessionId : '';

                res = await spawnSingleCliRun({
                    engine: eng,
                    binaryPath,
                    requestId,
                    sender: event.sender,
                    prompt: payload.prompt || '',
                    systemInstructions: payload.systemInstructions || '',
                    historyText: payload.historyText || '',
                    model: attemptModel,
                    disableThinking,
                    conversationKey,
                    resumeSessionId: curResumeId,
                    tempDir,
                    savedPaths,
                    ttsEmitter,
                    timeoutMs
                });

                // Nếu resume phiên cũ lỗi -> tự khởi tạo phiên mới 1 lần
                if (!res.success && !res.aborted && curResumeId) {
                    sessionMap.delete(conversationKey);
                    res = await spawnSingleCliRun({
                        engine: eng,
                        binaryPath,
                        requestId,
                        sender: event.sender,
                        prompt: payload.prompt || '',
                        systemInstructions: payload.systemInstructions || '',
                        historyText: payload.historyText || '',
                        model: attemptModel,
                        disableThinking,
                        conversationKey,
                        resumeSessionId: '',
                        tempDir,
                        savedPaths,
                        ttsEmitter,
                        timeoutMs
                    });
                }

                if (res.success || res.aborted) break;

                const errText = String(res.error || '');
                const isModelOverloadOrInvalid = /503|429|UNAVAILABLE|overloaded|high demand|RESOURCE_EXHAUSTED|quota|unknown model|invalid model/i.test(errText);
                if (!isModelOverloadOrInvalid || mIdx === modelAttempts.length - 1) {
                    break;
                }
                appendCliLog(`RETRY_MODEL req=${requestId} eng=${eng} failedModel=${attemptModel} nextModel=${modelAttempts[mIdx + 1]} err=${errText.slice(0, 180)}`);
            }

            lastRes = res;
            if (res && (res.success || res.aborted)) {
                break;
            }
            if (!res || !res.retriableFallback || i === engineOrder.length - 1) {
                break;
            }
            console.warn(`[Local CLI Agent] ${eng} lỗi (${res.error}), tự động chuyển sang ${engineOrder[i + 1]}...`);
            appendCliLog(`FALLBACK_ENGINE req=${requestId} from=${eng} to=${engineOrder[i + 1]} err=${String(res.error || '').slice(0, 180)}`);
        }

        appendCliLog(`END req=${requestId} ok=${!!(lastRes && lastRes.success)} eng=${lastRes?.engine || 'none'} model=${lastRes?.model || ''} ms=${Date.now() - tStart} err=${String(lastRes?.error || '').slice(0, 200)}`);

        if (lastRes && lastRes.success) {
            ttsEmitter.flush();
            if (event.sender && !event.sender.isDestroyed()) {
                event.sender.send('ai-agent:cli-stream', {
                    requestId,
                    type: 'done',
                    engine: lastRes.engine,
                    conversationId: lastRes.conversationId
                });
            }
        } else {
            ttsEmitter.stop();
        }

        return lastRes || { success: false, error: 'Không nhận được phản hồi từ CLI cục bộ.' };
    } finally {
        // Dọn tệp đính kèm tạm sau 5 giây (đủ để renderer đọc xong nếu cần)
        if (tempDir) {
            setTimeout(() => cleanupTempDir(tempDir), 5000);
        }
    }
}

function cancelLocalCliAgent(requestId) {
    let killed = 0;
    const targets = requestId
        ? (activeProcesses.has(requestId) ? [[requestId, activeProcesses.get(requestId)]] : [])
        : Array.from(activeProcesses.entries());

    for (const [id, rec] of targets) {
        rec.aborted = true;
        try {
            if (rec.child && !rec.child.killed) {
                rec.child.kill('SIGTERM');
                setTimeout(() => {
                    try {
                        if (rec.child && !rec.child.killed) rec.child.kill('SIGKILL');
                    } catch (_) {}
                }, 400);
                killed++;
            }
        } catch (_) {}
        activeProcesses.delete(id);
    }
    return { success: true, killed };
}

function cancelAllLocalCliAgents() {
    return cancelLocalCliAgent(null);
}

function clearCliSessions() {
    sessionMap.clear();
    return { success: true };
}

function registerLocalCliAgentHandlers(ipcMain) {
    ipcMain.handle('ai-agent:detect-clis', async (_event, forceRefresh) => {
        try {
            return await detectLocalClis(!!forceRefresh);
        } catch (e) {
            return {
                agy: { installed: false, path: null, version: '' },
                claude: { installed: false, path: null, version: '' },
                recommended: null,
                error: e.message
            };
        }
    });

    ipcMain.handle('ai-agent:run-cli', async (event, payload) => {
        try {
            return await runLocalCliAgent(event, payload);
        } catch (e) {
            return { success: false, error: e.message || String(e) };
        }
    });

    ipcMain.handle('ai-agent:cancel-cli', (_event, requestId) => {
        return cancelLocalCliAgent(requestId);
    });

    ipcMain.handle('ai-agent:clear-sessions', () => {
        return clearCliSessions();
    });
}

module.exports = {
    detectLocalClis,
    runLocalCliAgent,
    cancelLocalCliAgent,
    cancelAllLocalCliAgents,
    clearCliSessions,
    registerLocalCliAgentHandlers
};
