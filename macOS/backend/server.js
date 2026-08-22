const multer = require('multer');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, UnderlineType } = require('docx');
const HTMLtoDOCX = require('./node_modules/html-to-docx');
const { convert: convertPdf } = require('@opendataloader/pdf');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const SKILLS_DIR = path.join(__dirname, '../skills/academic-research-skills');
const SESSIONS_DIR = path.join(__dirname, '../sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
const CHATS_DIR = path.join(__dirname, '../Chats');
if (!fs.existsSync(CHATS_DIR)) fs.mkdirSync(CHATS_DIR, { recursive: true });

// Startup'ta eski sessions temizle
try {
  if (fs.existsSync(SESSIONS_DIR)) {
    fs.readdirSync(SESSIONS_DIR).forEach(dir => {
      try { fs.rmSync(path.join(SESSIONS_DIR, dir), { recursive: true, force: true }); } catch {}
    });
  }
} catch {}


// Aktif Claude Code process'leri: wsSessionId -> { proc, sessionId, buffer }
const activeProcs = new Map();

// Aktif WS bağlantıları: wsId -> ws
const activeWs = new Map();

wss.on('connection', (ws) => {
  const wsId = uuidv4();
  activeWs.set(wsId, ws);
  ws.isAlive = true;
  console.log(`[${wsId}] WS bağlantı kuruldu`);

  // Pong gelince canlı say
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'ping') {
      send(ws, { type: 'pong' });
    } else if (msg.type === 'chat') {
      await handleChat(ws, wsId, msg);
    } else if (msg.type === 'stop') {
      killProc(wsId);
      send(ws, { type: 'stopped' });
    } else if (msg.type === 'new_session') {
      killProc(wsId);
      send(ws, { type: 'session_cleared' });
    } else if (msg.type === 'resume') {
      const entry = activeProcs.get(msg.wsId);
      if (entry) {
        activeProcs.set(wsId, entry);
        entry.ws = ws;
        send(ws, { type: 'resumed', sessionId: entry.sessionId });
      }
    } else if (msg.type === 'rejoin') {
      // WS kopup yeniden bağlandı — claudeSessionId ile aktif process bul
      let found = null;
      for (const [key, entry] of activeProcs.entries()) {
        if (entry.sessionId === msg.sessionId) {
          found = { key, entry };
          break;
        }
      }
      if (found) {
        // Eski wsId'yi kaldır, yeni wsId ile kaydet
        activeProcs.delete(found.key);
        activeProcs.set(wsId, found.entry);
        found.entry.ws = ws;
        console.log(`[${wsId}] Rejoin — session: ${msg.sessionId}`);
        send(ws, { type: 'rejoined', sessionId: msg.sessionId });
      }
    }
  });

  ws.on('close', () => {
    activeWs.delete(wsId);
    console.log(`[${wsId}] WS kapandı — process devam ediyor`);
  });
});

// Her 10 saniyede ping gönder, cevap vermeyeni kes
const heartbeat = setInterval(() => {
  const count = wss.clients.size;
  console.log(`[heartbeat] ${count} bağlantı kontrol ediliyor`);
  wss.clients.forEach(ws => {
    if (!ws.isAlive) {
      console.log('[heartbeat] Cevapsız bağlantı sonlandırıldı');
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 10000);

wss.on('close', () => clearInterval(heartbeat));

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function killProc(wsId) {
  const entry = activeProcs.get(wsId);
  if (entry?.proc) {
    try { entry.proc.kill('SIGTERM'); } catch {}
    activeProcs.delete(wsId);
  }
}

async function handleChat(ws, wsId, msg) {
  const { text, mode } = msg;

  let entry = activeProcs.get(wsId);

  if (!entry) {
    entry = startClaudeProcess(ws, wsId, mode);
    activeProcs.set(wsId, entry);
    await waitForInit(entry, 8000);
  } else {
    // Reconnect: ws referansını güncelle
    entry.ws = ws;
  }

  // User mesajını history'e ekle
  if (!entry.history) entry.history = [];
  entry.history.push({ role: 'user', text });

  // Mesajı stdin'e gönder
  const inputMsg = JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n';
  try {
    entry.proc.stdin.write(inputMsg);
    send(ws, { type: 'thinking' });
  } catch (err) {
    send(ws, { type: 'error', text: `Mesaj gönderilemedi: ${err.message}` });
  }
}

function startClaudeProcess(ws, wsId, mode) {
  const sessionId = uuidv4();

  // Kullanıcı çalışma dizini: session klasörü içinde
  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  // Skills'i symlink ile bağla — repo'nun önerdiği kurulum şekli
  const skillsLink = path.join(sessionDir, '.claude', 'skills');
  fs.mkdirSync(path.join(sessionDir, '.claude'), { recursive: true });

  const skillNames = ['deep-research', 'academic-paper', 'academic-paper-reviewer', 'academic-pipeline', 'grad-grounded-theory', 'academic-pptx-skill'];
  fs.mkdirSync(skillsLink, { recursive: true });
  for (const skill of skillNames) {
    const src = path.join(SKILLS_DIR, skill);
    const dst = path.join(skillsLink, skill);
    if (!fs.existsSync(dst) && fs.existsSync(src)) {
      try { fs.symlinkSync(src, dst); } catch {}
    }
  }

  // CLAUDE.md'yi de kopyala
  const claudeMdSrc = path.join(SKILLS_DIR, '.claude', 'CLAUDE.md');
  const claudeMdDst = path.join(sessionDir, '.claude', 'CLAUDE.md');
  if (fs.existsSync(claudeMdSrc) && !fs.existsSync(claudeMdDst)) {
    fs.copyFileSync(claudeMdSrc, claudeMdDst);
  }

  // İlk sistem mesajı — Türkçe + mod yönlendirmesi
  const modeHints = {
    arastirma: 'deep-research full mode — sistematik literatür taraması yap',
    socratik:  'deep-research socratic mode — kullanıcıyı Sokratik diyalogla yönlendir',
    makale:    'academic-paper full mode — baştan sona akademik makale yaz',
    plan:      'academic-paper plan mode — adım adım makale planla',
    hakem:     'academic-paper-reviewer full mode — 5 perspektiften hakem incelemesi yap',
    pipeline:  'academic-pipeline — araştırmadan makaleye tam 10 aşamalı süreç',
  };
  const modeHint = modeHints[mode] || modeHints['makale'];

  const appendPrompt = `Sen Türkçe konuşan bir akademik araştırma asistanısın. 
Tüm yanıtlarını Türkçe ver. Akademik içerik (atıflar, terimler) gerektiğinde İngilizce olabilir ama açıklamalar Türkçe olmalı.
Aktif mod: ${modeHint}.`;

  const claudeArgs = [
    '--print',
    '--verbose',
    '--output-format', 'stream-json',
    '--input-format', 'stream-json',
    '--include-partial-messages',
    '--dangerously-skip-permissions',
    '--session-id', sessionId,
  ];

  console.log(`[${wsId}] Claude Code başlatılıyor — session: ${sessionId}, mod: ${mode}`);
  console.log(`[${wsId}] Çalışma dizini: ${sessionDir}`);

  const proc = spawn('claude', claudeArgs, {
    cwd: sessionDir,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const entry = { proc, sessionId, buffer: '', initialized: false, ws, streamedLen: 0 };

  proc.stdout.on('data', (chunk) => {
    entry.buffer += chunk.toString();
    const lines = entry.buffer.split('\n');
    entry.buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        handleEvent(entry.ws, wsId, entry, event);
      } catch {
        if (line.trim()) send(entry.ws, { type: 'token', text: line });
      }
    }
  });

  proc.stderr.on('data', (chunk) => {
    const t = chunk.toString().trim();
    console.error(`[${wsId}] stderr:`, t);
    if (t.toLowerCase().includes('error') && !t.includes('ExperimentalWarning')) {
      send(entry.ws, { type: 'error', text: t });
    }
  });

  proc.on('close', (code) => {
    console.log(`[${wsId}] Claude Code kapandı, kod: ${code}`);
    activeProcs.delete(wsId);
    send(entry.ws, { type: 'done', code });
  });

  proc.on('error', (err) => {
    send(entry.ws, { type: 'error', text: `Claude Code başlatılamadı: ${err.message}\n\nkurulum.command'ı çalıştırdınız mı?` });
  });

  return entry;
}

function handleEvent(ws, wsId, entry, event) {
  if (!event?.type) return;
  // DEBUG: gelen eventleri logla
  if (event.type === 'assistant') {
    const textLen = event.message?.content?.[0]?.text?.length || 0;
    console.log(`[${wsId}] EVENT: ${event.type} — text uzunluk: ${textLen}`);
  } else if (event.type === 'stream_event') {
    // stream_event içeriğini göster
    console.log(`[${wsId}] STREAM_EVENT:`, JSON.stringify(event).slice(0, 300));
  } else {
    console.log(`[${wsId}] EVENT: ${event.type}${event.subtype ? '/' + event.subtype : ''}`);
  }

  switch (event.type) {
    case 'system':
      if (event.subtype === 'init') {
        entry.initialized = true;
        send(ws, { type: 'connected', sessionId: entry.sessionId });
        console.log(`[${wsId}] Claude Code init — session: ${entry.sessionId}`);
      }
      break;

    case 'stream_event': {
      const se = event.event;
      if (se?.type === 'content_block_start' && se?.content_block?.type === 'tool_use') {
        send(ws, { type: 'tool', name: se.content_block.name });
      }
      if (se?.type === 'content_block_delta' && se?.delta?.type === 'text_delta') {
            const txt = se.delta.text;
            if (txt) {
              if (!entry.lastAssistantText) entry.lastAssistantText = '';
              entry.lastAssistantText += txt;
              if (!entry.tokenCount) entry.tokenCount = 0;
              entry.tokenCount += Math.ceil(txt.length / 4);
              send(ws, { type: 'token', text: txt, tokens: entry.tokenCount });
            }
          }
          // Mesaj bitince gerçek token sayısını gönder
          if (se?.type === 'message_delta' && se?.usage?.output_tokens) {
            entry.tokenCount = se.usage.output_tokens;
            send(ws, { type: 'token_final', tokens: se.usage.output_tokens });
          }
          break;
        }

    case 'assistant':
          // stream_event ile zaten gönderildi — sadece history için kaydet, tekrar gönderme
          if (event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'text' && block.text) {
                entry.lastAssistantText = block.text;
              }
            }
          }
          break;

    case 'rate_limit_event':
      // Rate limit / context limit bilgisini frontend'e ilet
      if (event.rate_limit) {
        const { status, resets_at } = event.rate_limit;
        if (status === 'allowed_warning' || status === 'rejected') {
          send(ws, { type: 'rate_limit_warning', status, resetsAt: resets_at });
        }
      }
      break;

    case 'result':
      // Mesaj tamamlandı — son metni history'e kaydet
      if (entry.lastAssistantText) {
        if (!entry.history) entry.history = [];
        entry.history.push({ role: 'assistant', text: entry.lastAssistantText });
        entry.lastAssistantText = '';
        entry.streamedLen = 0;
      }
      entry.tokenCount = 0;
      send(ws, { type: 'message_done' });
      break;

    case 'stream_event':
      // Gerçek streaming — delta text'i çıkar
      try {
        const ev = event.event || event;
        let deltaText = null;

        // Olası yapılar
        if (ev.delta?.text) deltaText = ev.delta.text;
        else if (ev.content_block?.text) deltaText = ev.content_block.text;
        else if (ev.text) deltaText = ev.text;
        else if (typeof ev === 'string') deltaText = ev;

        if (deltaText) {
          entry.streamedLen += deltaText.length;
          send(ws, { type: 'token', text: deltaText });
        }
      } catch {}
      break;

    case 'tool_use':
      // Araç kullanımını bildir
      if (event.name) {
        send(ws, { type: 'tool', name: event.name });
      }
      break;
  }
}

function waitForInit(entry, timeoutMs) {
  return new Promise((resolve) => {
    if (entry.initialized) { resolve(); return; }
    const t = setTimeout(resolve, timeoutMs);
    const check = setInterval(() => {
      if (entry.initialized) {
        clearInterval(check);
        clearTimeout(t);
        resolve();
      }
    }, 100);
  });
}


app.post('/api/title', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.json({ title: 'Yeni Sohbet' });
  try {
    const prompt = `Aşağıdaki kullanıcı mesajı için 3-5 kelimelik kısa bir sohbet başlığı üret. Sadece başlığı yaz, başka hiçbir şey ekleme, nokta koyma:\n\n${text.slice(0, 200)}`;
    const proc = spawn('claude', ['--print'], {
      env: { ...process.env },
      cwd: process.env.HOME,
    });
    let out = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.stdin.write(prompt, 'utf8');
    proc.stdin.end();
    proc.on('close', () => {
      const title = out.trim().split('\n')[0].slice(0, 50) || 'Yeni Sohbet';
      res.json({ title });
    });
    proc.on('error', () => res.json({ title: text.slice(0, 35) }));
    setTimeout(() => { try { proc.kill(); } catch {} }, 15000);
  } catch {
    res.json({ title: text.slice(0, 35) });
  }
});

// ── Dosya yükleme (PDF: opendataloader-pdf, diğer: markitdown) ──
const UPLOADS_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 25 * 1024 * 1024 } });

function findMarkitdown() {
  const candidates = [
    path.join(process.env.HOME || '', 'Library/Python/3.13/bin/markitdown'),
    path.join(process.env.HOME || '', 'Library/Python/3.12/bin/markitdown'),
    path.join(process.env.HOME || '', '.local/bin/markitdown'),
    'markitdown',
  ];
  return candidates.find(p => p === 'markitdown' || fs.existsSync(p)) || 'markitdown';
}

function runMarkitdown(filePath) {
  return new Promise((resolve) => {
    const bin = findMarkitdown();
    const proc = spawn(bin, [filePath]);
    let out = '', err = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.stderr.on('data', d => err += d.toString());
    proc.on('close', (code) => {
      if (code === 0 && out.trim()) resolve(out.trim());
      else resolve(null);
    });
    proc.on('error', () => resolve(null));
    setTimeout(() => { try { proc.kill(); } catch {} resolve(null); }, 30000);
  });
}

// PDF'leri opendataloader-pdf (Java tabanlı) ile markdown'a çevirir.
// Java kurulu değilse convert() reddedilir; hata çağırana bırakılır.
async function runOpenDataLoaderPdf(filePath) {
  const outputDir = path.join(UPLOADS_DIR, 'odl-' + uuidv4().slice(0, 8));
  fs.mkdirSync(outputDir, { recursive: true });
  try {
    await convertPdf([filePath], { outputDir, format: 'markdown' });
    const mdFile = fs.readdirSync(outputDir).find(f => f.endsWith('.md'));
    if (!mdFile) return null;
    return fs.readFileSync(path.join(outputDir, mdFile), 'utf8').trim();
  } finally {
    fs.rm(outputDir, { recursive: true, force: true }, () => {});
  }
}

app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya yok' });
  const { path: tmpPath, originalname } = req.file;
  const isPdf = /\.pdf$/i.test(originalname);
  try {
    let text = null;
    if (isPdf) {
      try {
        text = await runOpenDataLoaderPdf(tmpPath);
      } catch (e) {
        console.error('[opendataloader-pdf] Hata:', e.message);
        fs.unlink(tmpPath, () => {});
        return res.status(500).json({ error: 'PDF işlenemedi, Java 11+ kurulu olmalı (https://adoptium.net)' });
      }
      if (!text) {
        fs.unlink(tmpPath, () => {});
        return res.status(500).json({ error: 'PDF işlenemedi, Java 11+ kurulu olmalı (https://adoptium.net)' });
      }
    } else {
      text = await runMarkitdown(tmpPath);
      if (!text) {
        // markitdown başarısızsa ham metin olarak oku (txt/md gibi dosyalar için)
        try { text = fs.readFileSync(tmpPath, 'utf8').slice(0, 12000); } catch { text = null; }
      }
    }
    fs.unlink(tmpPath, () => {});
    if (!text) return res.status(500).json({ error: 'Dosya işlenemedi' });
    res.json({ filename: originalname, content: text.slice(0, 12000) });
  } catch (e) {
    try { fs.unlink(tmpPath, () => {}); } catch {}
    res.status(500).json({ error: e.message });
  }
});

// ── İndirme hazırlama ──────────────────────────────────────────
const DOWNLOADS_DIR = require('path').join(__dirname, '../downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

app.post('/api/prepare-download', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Metin gerekli' });

  const fileId = uuidv4().slice(0, 8);
  const docxFile = 'a3i-' + fileId + '.docx';
  const pdfFile  = 'a3i-' + fileId + '.pdf';
  const docxPath = path.join(DOWNLOADS_DIR, docxFile);
  const pdfPath  = path.join(DOWNLOADS_DIR, pdfFile);

  try {
    // 1. LaTeX akademik format prompt — içerik değişmez, sadece format
    const formatPrompt = `Sen bir akademik yayın editörüsün. Aşağıdaki metni DOCX ve PDF çıktısı için LaTeX akademik makale standartlarına göre yeniden yapılandır.

KESİN KURALLAR — BUNLARI ASLA YAPMA:
- Tek bir kelime, cümle, rakam, istatistik, atıf veya kaynak değiştirme
- İçerik ekleme veya çıkarma
- Yazarın fikirlerini yorumlama veya parafraz etme
- Açıklama veya not ekleme

YAPMAN GEREKENLER (sadece format):
- Bölüm başlıklarını # ## ### hiyerarşisiyle düzenle
- Özet varsa en başa, Kaynakça en sona gelsin
- Tabloları Markdown tablo formatında (**başlık satırı kalın**) düzenle
- Listeleri madde işaretli olarak düzenle
- Kalın metinleri **kalın**, italikleri *italik* koru
- Boşlukları ve satır aralıklarını akademik standarda getir
- Sadece düzenlenmiş metni döndür, başka hiçbir şey yazma

METİN:
${text.slice(0, 12000)}`;

    const formatted = await runClaude(formatPrompt);
    const finalText = formatted || text;

    // 2. Markdown → HTML
    const html = markdownToHtml(finalText);

    // 3. HTML → DOCX (html-to-docx ile düzgün format)
    const docxBuffer = await HTMLtoDOCX(html, null, {
      table: { row: { cantSplit: true } },
      footer: false,
      pageNumber: false,
      font: 'Cambria',
      fontSize: 24,
      margins: { top: 1440, right: 1440, bottom: 1440, left: 1800 },
      decodeEntities: false,
    });
    if (!docxBuffer || docxBuffer.length < 100) throw new Error('DOCX oluşturulamadı');
    fs.writeFileSync(docxPath, docxBuffer);
    console.log(`[DOCX] Oluşturuldu: ${docxPath} (${docxBuffer.length} byte)`);

    // 4. PDF — Chrome headless ile HTML'den
    const htmlPath = path.join(DOWNLOADS_DIR, 'a3i-' + fileId + '.html');
    const printHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  @page { margin: 2.5cm; }
  body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #1a1a1a; }
  h1 { font-size: 18pt; margin: 24pt 0 12pt; border-bottom: 1px solid #ccc; padding-bottom: 6pt; }
  h2 { font-size: 14pt; margin: 18pt 0 9pt; }
  h3 { font-size: 12pt; margin: 14pt 0 6pt; }
  h4 { font-size: 11pt; margin: 10pt 0 4pt; }
  table { border-collapse: collapse; width: 100%; margin: 12pt 0; page-break-inside: avoid; }
  th { background: #f0f0f0; padding: 6pt 10pt; border: 1px solid #999; font-weight: bold; text-align: left; }
  td { padding: 5pt 10pt; border: 1px solid #ccc; vertical-align: top; }
  tr:nth-child(even) td { background: #f9f9f9; }
  code { font-family: 'Courier New'; font-size: 10pt; background: #f5f5f5; padding: 1pt 4pt; border-radius: 2pt; }
  pre { background: #f5f5f5; padding: 10pt; border-radius: 4pt; overflow-x: auto; page-break-inside: avoid; }
  blockquote { border-left: 3pt solid #666; padding-left: 12pt; margin: 8pt 0; color: #444; font-style: italic; }
  hr { border: none; border-top: 1pt solid #999; margin: 12pt 0; }
  ul, ol { padding-left: 20pt; margin: 6pt 0; }
  li { margin: 3pt 0; }
  strong { font-weight: bold; }
  em { font-style: italic; }
  a { color: #1a1a2e; text-decoration: none; }
</style></head><body>${html}</body></html>`;
    fs.writeFileSync(htmlPath, printHtml);

    let pdfCreated = false;
    const { execSync } = require('child_process');
    const chromePaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      `${process.env.HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : '',
    ].filter(p => p && fs.existsSync(p));

    // which komutu ile de dene
    if (!chromePaths.length) {
      try {
        const found = execSync('which google-chrome 2>/dev/null || which chromium 2>/dev/null || which chromium-browser 2>/dev/null').toString().trim();
        if (found && fs.existsSync(found)) chromePaths.push(found);
      } catch {}
    }
    for (const chromePath of chromePaths) {
      if (fs.existsSync(chromePath)) {
        try {
          execSync(`"${chromePath}" --headless=new --disable-gpu --no-sandbox --print-to-pdf="${pdfPath}" --no-margins "file://${htmlPath}" 2>/dev/null`, { timeout: 30000 });
          if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 1000) {
            pdfCreated = true;
            break;
          }
        } catch (e) {
          console.log('Chrome PDF hatası:', e.message);
        }
      }
    }

    // Pandoc fallback
    if (!pdfCreated) {
      try {
        execSync(`which pandoc && pandoc "${htmlPath}" -o "${pdfPath}" --pdf-engine=weasyprint 2>/dev/null || pandoc "${htmlPath}" -o "${pdfPath}" 2>/dev/null`, { timeout: 30000 });
        if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 1000) pdfCreated = true;
      } catch {}
    }

    // Cleanup HTML
    try { fs.unlinkSync(htmlPath); } catch {}

    // 1 saat sonra dosyaları sil
    setTimeout(() => {
      try { fs.unlinkSync(docxPath); } catch {}
      try { if (pdfCreated) fs.unlinkSync(pdfPath); } catch {}
    }, 3600000);

    res.json({ docxFile, pdfFile: pdfCreated ? pdfFile : null });
  } catch (err) {
    console.error('İndirme hatası:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/download/:file', (req, res) => {
  const filePath = require('path').join(DOWNLOADS_DIR, require('path').basename(req.params.file));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Dosya bulunamadı' });
  res.download(filePath);
});

function markdownToHtml(text) {
  let html = text
    // Başlıklar
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Kalın ve italik
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Kod blokları (önce bunları işle)
    .replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`)
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Yatay çizgi
    .replace(/^---+$/gm, '<hr>')
    // Alıntı
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Listeler
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\* (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');

  // <li> gruplarını <ul> içine al
  html = html.replace(/(<li>.*<\/li>\n?)+/g, s => `<ul>${s}</ul>`);

  // Tablolar — Markdown tablo formatı
  html = html.replace(/^(\|.+\|\n)(\|[-| :]+\|\n)((?:\|.+\|\n?)*)/gm, (match, header, separator, rows) => {
    const ths = header.split('|').filter(s => s.trim()).map(s => `<th>${s.trim()}</th>`).join('');
    const trs = rows.trim().split('\n').filter(Boolean).map(row => {
      const tds = row.split('|').filter(s => s.trim()).map(s => `<td>${s.trim()}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
  });

  // Paragraflar — boş satırları <p> yap
  html = html
    .split('\n\n')
    .map(block => {
      block = block.trim();
      if (!block) return '';
      if (/^<(h[1-6]|ul|ol|li|table|pre|blockquote|hr)/.test(block)) return block;
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  return html;
}

function runClaude(prompt) {
  return new Promise((resolve) => {
    const proc = spawn('claude', ['--print', prompt], { cwd: SKILLS_DIR, env: { ...process.env } });
    let out = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.on('close', () => resolve(out.trim()));
    proc.on('error', () => resolve(''));
    setTimeout(() => { try { proc.kill(); } catch {} resolve(out.trim()); }, 60000);
  });
}

function mdToDocx(text) {
  const paragraphs = [];
  const lines = text.split('\n');

  for (const line of lines) {
    if (!line.trim()) {
      paragraphs.push(new Paragraph({ children: [new TextRun('')], spacing: { after: 80 } }));
      continue;
    }
    if (line.startsWith('# '))  { paragraphs.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 })); continue; }
    if (line.startsWith('## ')) { paragraphs.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 })); continue; }
    if (line.startsWith('### ')){ paragraphs.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 })); continue; }
    if (/^[-*_]{3,}$/.test(line.trim())) {
      paragraphs.push(new Paragraph({ border: { bottom: { color: '999999', size: 4, space: 1, style: BorderStyle.SINGLE } } }));
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      paragraphs.push(new Paragraph({ children: parseRuns(line.slice(2)), bullet: { level: 0 } }));
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      paragraphs.push(new Paragraph({ children: parseRuns(line.replace(/^\d+\.\s/, '')), numbering: { reference: 'default-numbering', level: 0 } }));
      continue;
    }
    paragraphs.push(new Paragraph({ children: parseRuns(line), spacing: { after: 120 } }));
  }
  return paragraphs;
}

function parseRuns(text) {
  const runs = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`]+))/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m[2]) runs.push(new TextRun({ text: m[2], bold: true }));
    else if (m[3]) runs.push(new TextRun({ text: m[3], italics: true }));
    else if (m[4]) runs.push(new TextRun({ text: m[4], font: 'Courier New', size: 20 }));
    else if (m[5]) runs.push(new TextRun({ text: m[5] }));
  }
  return runs.length ? runs : [new TextRun({ text })];
}

function mdToHtml(text) {
  const body = text
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^---+$/gm, '<hr>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\n/gm, '<br>')
    .replace(/(<li>.*<\/li>\n?)+/g, s => '<ul>' + s + '</ul>');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.6;margin:2.5cm;color:#1a1a1a}
    h1{font-size:18pt;margin:24pt 0 12pt;color:#1a1a2e}
    h2{font-size:14pt;margin:18pt 0 9pt;color:#16213e}
    h3{font-size:12pt;margin:14pt 0 6pt;color:#0f3460}
    table{border-collapse:collapse;width:100%;margin:12pt 0}
    th{background:#f0f0f0;padding:6pt 10pt;border:1px solid #ccc;font-weight:bold}
    td{padding:5pt 10pt;border:1px solid #ddd}
    code{font-family:'Courier New';font-size:10pt;background:#f5f5f5;padding:1pt 3pt}
    hr{border:none;border-top:1px solid #999;margin:12pt 0}
    ul{margin:6pt 0;padding-left:20pt}
  </style></head><body>${body}</body></html>`;
}

// ── Chats API ──────────────────────────────────────────────────
app.get('/api/chats', (req, res) => {
  try {
    const dirs = fs.readdirSync(CHATS_DIR)
      .filter(f => fs.statSync(path.join(CHATS_DIR, f)).isDirectory());
    const chats = dirs.map(name => {
      const logFile = path.join(CHATS_DIR, name, 'conversation.jsonl');
      const lastTs = fs.existsSync(logFile) ? fs.statSync(logFile).mtimeMs : 0;
      return { name, lastTs };
    }).sort((a, b) => b.lastTs - a.lastTs);
    res.json(chats);
  } catch { res.json([]); }
});

app.get('/api/chats/:name', (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const logFile = path.join(CHATS_DIR, name, 'conversation.jsonl');
    if (!fs.existsSync(logFile)) return res.json([]);
    const msgs = fs.readFileSync(logFile, 'utf8').trim().split('\n')
      .filter(Boolean).map(l => JSON.parse(l));
    res.json(msgs);
  } catch { res.json([]); }
});

app.post('/api/chats/:name/message', (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const { role, text } = req.body;
    const chatPath = path.join(CHATS_DIR, name);
    fs.mkdirSync(chatPath, { recursive: true });
    const line = JSON.stringify({ role, text, ts: new Date().toISOString() }) + '\n';
    fs.appendFileSync(path.join(chatPath, 'conversation.jsonl'), line);
    res.json({ ok: true });
  } catch(e) { 
    console.error('[MESSAGE] Hata:', e.message, e.stack);
    res.status(500).json({ error: e.message }); 
  }
});

app.post('/api/chats/:name/session', (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const { sessionId } = req.body;
    const chatPath = path.join(CHATS_DIR, name);
    fs.mkdirSync(chatPath, { recursive: true });
    fs.writeFileSync(path.join(chatPath, 'session_id.txt'), sessionId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/chats/:name/rename', (req, res) => {
  try {
    const oldName = decodeURIComponent(req.params.name);
    const { newName } = req.body;
    const sanitized = newName.replace(/[/\\:*?"<>|.]/g, '').trim().slice(0, 50);
    if (!sanitized) return res.status(400).json({ error: 'Geçersiz isim' });
    const oldPath = path.join(CHATS_DIR, oldName);
    const newPath = path.join(CHATS_DIR, sanitized);
    if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'Bulunamadı' });
    if (fs.existsSync(newPath)) return res.status(409).json({ error: 'Bu isim zaten var' });
    fs.renameSync(oldPath, newPath);
    res.json({ ok: true, newName: sanitized });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/chats/:name', (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const chatPath = path.join(CHATS_DIR, name);

    // Session klasörünü de sil
    const sessionIdFile = path.join(chatPath, 'session_id.txt');
    if (fs.existsSync(sessionIdFile)) {
      const sessionId = fs.readFileSync(sessionIdFile, 'utf8').trim();
      const sessionPath = path.join(SESSIONS_DIR, sessionId);
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log(`[DELETE] Session silindi: ${sessionId}`);
      }
    }

    if (fs.existsSync(chatPath)) {
      fs.rmSync(chatPath, { recursive: true, force: true });
      console.log(`[DELETE] Chat silindi: ${name}`);
    }
    res.json({ ok: true });
  } catch(e) {
    console.error('[DELETE] Hata:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/chats/:name/session-id', (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const file = path.join(CHATS_DIR, name, 'session_id.txt');
    if (!fs.existsSync(file)) return res.json({ sessionId: null });
    const sessionId = fs.readFileSync(file, 'utf8').trim();
    const sessionPath = path.join(SESSIONS_DIR, sessionId);
    if (!fs.existsSync(sessionPath)) return res.json({ sessionId: null });
    res.json({ sessionId });
  } catch { res.json({ sessionId: null }); }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', sessions: activeProcs.size });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n✓ Akademik Asistan: http://localhost:${PORT}`);
  console.log(`✓ Skills: ${SKILLS_DIR}\n`);
});
