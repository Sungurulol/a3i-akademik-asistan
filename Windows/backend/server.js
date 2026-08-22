const multer = require('multer');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
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

// CORS bilerek açılmıyor: frontend aynı origin'den (express.static) servis
// ediliyor, dolayısıyla cross-origin izni gerekmiyor. Kısıtsız bir cors(),
// kullanıcının ziyaret ettiği herhangi bir sitenin localhost:3000'deki
// API'ye istek atmasına (drive-by CSRF) izin verirdi.
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const SKILLS_DIR = path.join(__dirname, '../skills/academic-research-skills');
const SESSIONS_DIR = path.join(__dirname, '../sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
const CHATS_DIR = path.join(__dirname, '../Chats');
if (!fs.existsSync(CHATS_DIR)) fs.mkdirSync(CHATS_DIR, { recursive: true });

// ── Yol güvenliği ──────────────────────────────────────────────
// Dışarıdan gelen sohbet/oturum adı doğrudan path.join'e verilirse '../..'
// gibi bir adla taban klasörün dışına çıkılabilir (en kötüsü: DELETE'teki
// rmSync). Bu yardımcı adı doğrular ve çözülen yolun taban klasörün içinde
// kaldığını garanti eder; aksi halde null döner.
function safePathIn(baseDir, name, ...segments) {
  if (typeof name !== 'string') return null;
  const clean = name.trim();
  if (!clean || clean === '.' || clean === '..') return null;
  if (/[\\/\0]/.test(clean)) return null;   // yol ayırıcı veya NUL içeren ad kabul edilmez
  const root = path.resolve(baseDir);
  const resolved = path.resolve(root, clean, ...segments);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

// Sohbet klasörü — ya da içindeki bir dosya — için güvenli mutlak yol.
const safeChatPath = (name, ...segments) => safePathIn(CHATS_DIR, name, ...segments);
// Claude Code oturum klasörü için güvenli mutlak yol.
const safeSessionPath = (id) => safePathIn(SESSIONS_DIR, id);

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

// Süreci sonlandırır ve GERÇEKTEN kapanmasını bekler.
// Beklemek şart: Claude session durumunu kapanırken yazıyor; hemen --resume
// edilirse session henüz diskte olmadığı için resume tutmaz.
function killProc(wsId) {
  const entry = activeProcs.get(wsId);
  if (!entry?.proc) return Promise.resolve();

  // Önce haritadan çıkar — böylece bu sürecin 'close' handler'ı,
  // yerine geçen yeni süreci haritadan silmez.
  activeProcs.delete(wsId);

  return new Promise((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; clearTimeout(t); resolve(); } };
    entry.proc.once('close', done);
    const t = setTimeout(() => {
      try { entry.proc.kill('SIGKILL'); } catch {}
      done();
    }, 3000);
    try { entry.proc.kill('SIGTERM'); } catch { done(); }
  });
}

async function handleChat(ws, wsId, msg) {
  const { text, mode } = msg;
  // entry üzerinde doğrulanmış değerler tutulduğu için karşılaştırma öncesi burada da normalize et,
  // yoksa geçersiz bir değer her mesajda yeniden başlatmayı tetikler.
  const model  = ALLOWED_MODELS.includes(msg.model)   ? msg.model  : null;
  const effort = ALLOWED_EFFORTS.includes(msg.effort) ? msg.effort : null;

  let entry = activeProcs.get(wsId);

  if (!entry) {
    entry = startClaudeProcess(ws, wsId, mode, { model, effort });
    activeProcs.set(wsId, entry);
  } else if (entry.model !== model || entry.effort !== effort || entry.mode !== (mode || null)) {
    // model/effort/mod üçü de başlatma bayrağı (mod --append-system-prompt'a gömülü),
    // biri değiştiyse süreci yeniden başlat. --resume ile bağlam korunur.
    const prevSessionId = entry.sessionId;
    console.log(`[${wsId}] Ayar değişti → yeniden başlatılıyor (${entry.model || 'varsayılan'}/${entry.effort || 'varsayılan'}/${entry.mode || 'modsuz'} → ${model || 'varsayılan'}/${effort || 'varsayılan'}/${mode || 'modsuz'})`);
    send(ws, { type: 'model_switching', model, effort });
    await killProc(wsId);          // eski süreç kapanana kadar bekle (session diske yazılsın)

    entry = startClaudeProcess(ws, wsId, mode, { model, effort, resumeSessionId: prevSessionId });
    // Resume tutmazsa (session bulunamadı vb.) temiz süreçle tekrar denenebilmesi için
    // mesajı sakla — süreç init olmadan kapanırsa 'close' handler'ı devralır.
    entry.retryOpts = { mode, model, effort };
    activeProcs.set(wsId, entry);
  } else {
    // Reconnect: ws referansını güncelle
    entry.ws = ws;
  }

  // User mesajını history'e ekle
  if (!entry.history) entry.history = [];
  entry.history.push({ role: 'user', text });

  sendToProc(ws, wsId, entry, text);
}

// Mesajı sürecin stdin'ine yazar.
// NOT: Claude Code 'system/init' olayını ancak ilk girdiden SONRA yayınlıyor;
// bu yüzden init'i beklemek yerine mesaj doğrudan yazılır (eskiden buradaki
// bekleme her yeni sohbete 8 saniyelik boş gecikme ekliyordu).
function sendToProc(ws, wsId, entry, text) {
  entry.lastText = text;
  const inputMsg = JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n';
  try {
    entry.proc.stdin.write(inputMsg);
    send(ws, { type: 'thinking' });
  } catch (err) {
    send(ws, { type: 'error', text: `Mesaj gönderilemedi: ${err.message}` });
  }
}

// Claude CLI'ın kabul ettiği değerler — dışarıdan gelen input doğrudan argv'ye geçmesin
const ALLOWED_MODELS  = ['opus', 'sonnet', 'haiku', 'fable'];
const ALLOWED_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

const SKILL_NAMES = [
  'deep-research', 'academic-paper', 'academic-paper-reviewer',
  'academic-pipeline', 'grad-grounded-theory', 'academic-pptx-skill',
];

// ── Alan bağlamı ───────────────────────────────────────────────
// Sistem promptuna eklenir; soruların ve şıkların hangi alana göre
// somutlaşacağını belirler. Başka bir alana geçilecekse SADECE burası
// değiştirilir. Boş bırakılırsa asistan alandan bağımsız davranır.
const ALAN_BAGLAMI = `ALAN BAĞLAMI
Kullanıcılar BESYO (Beden Eğitimi ve Spor Yüksekokulu) / spor bilimleri alanından.
Soruları, şıkları ve örnekleri bu alana göre somutlaştır. "Sosyal Bilimler",
"Fen Bilimleri" gibi geniş kategorileri şık olarak SUNMA — doğrudan spor
bilimlerinin alt alanlarını ve bu alandaki yöntem tercihlerini sor.

Alt alanlar: antrenman bilimi, egzersiz fizyolojisi, biyomekanik, motor öğrenme
ve gelişim, spor psikolojisi, spor yönetimi ve pazarlama, rekreasyon, beden
eğitimi öğretmenliği (pedagoji), spor beslenmesi, sporcu sağlığı ve
rehabilitasyon, engellilerde spor/adapte fiziksel aktivite, performans analizi.

Bu alanda tipik olarak netleşmesi gereken şeyler — sorularını bunlardan seç:
- Çalışma deseni: deneysel/RCT, ön test-son test, kesitsel, boylamsal,
  ölçek geliştirme/uyarlama, sistematik derleme/meta-analiz,
  NİTEL (görüşme/odak grup, gömülü kuram, fenomenoloji, durum çalışması),
  karma yöntem
- Örneklem: elit sporcu, amatör/rekreasyonel, çocuk-genç sporcu, üniversite
  öğrencisi, sedanter yetişkin, yaşlı, engelli sporcu; cinsiyet ve yaş aralığı
- Branş: takım (futbol, basketbol, voleybol, hentbol) veya bireysel
  (atletizm, yüzme, güreş, tenis, judo, taekwondo, cimnastik)
- Ölçüm/değişken: VO2maks, laktat, kalp atım hızı, kuvvet-kondisyon testleri,
  sürat-çeviklik, denge-esneklik, antropometri/vücut kompozisyonu, izokinetik,
  ölçek/anket puanları
- Uygulama/müdahale: direnç antrenmanı, HIIT, pliometrik, kor, esneklik,
  zihinsel antrenman, beslenme desteği
- Hedef dergi düzeyi: SSCI/SCI-E, ESCI, Scopus, TR Dizin

Nitel bir çalışma söz konusuysa (görüşme, odak grup, gözlem, açık uçlu veri;
kuram geliştirme, kodlama, teorik doygunluk) grad-grounded-theory skill'ini
kullan — açık/eksenel/seçici kodlama ve sürekli karşılaştırma buradan gelir.

NİTEL ANALİZ YAZILIMI (NVivo / MAXQDA)
Bu alanda nitel analiz çoğunlukla NVivo veya MAXQDA ile yürütülür. Nitel bir
işte MUTLAKA hangisinin kullanıldığını sor ve çıktıyı o programa aktarılabilir
biçimde üret. İki program aynı işi yapar ama terminolojileri farklıdır:
- NVivo: kodlara "node/düğüm" denir, hiyerarşi "parent/child node"dur,
  proje dosyası .nvp/.nvpx'tir. Kod defteri Excel'den içe aktarılır.
- MAXQDA: kodlara "kod", hiyerarşiye "kod sistemi" denir, proje dosyası
  .mx24 gibi bir uzantıdadır. Kod sistemi Excel'den içe aktarılır.
Terimleri kullanıcının seçtiği programa göre kullan; NVivo diyene "kod sistemi",
MAXQDA diyene "düğüm" deme.

Üretebileceğin aktarılabilir çıktılar (exceljs/docx kurulu):
- Kod defteri / kod sistemi (.xlsx): hiyerarşik kod adı (üst kod > alt kod),
  tanım, dahil etme ölçütü, hariç tutma ölçütü, örnek alıntı, kaynak
- Kodlanmış segment tablosu (.xlsx): kaynak/doküman, katılımcı, kod, alıntı,
  konum/satır, memo
- Görüşme transkripti (.docx) — programa doküman olarak aktarmak için
ÖNEMLİ: .nvp/.nvpx veya .mx24 gibi programın kendi proje dosyasını ÜRETEMEZSİN;
bunlar kapalı biçimlerdir. Kullanıcıya "içe aktarılabilir kod defteri/segment
tablosu üretiyorum" de, "NVivo projesi üretiyorum" DEME.`;

// Akademik skill'leri hedef klasöre symlink'ler + CLAUDE.md'yi kopyalar.
// Hem sohbet oturumları hem sunum üretimi aynı skill setini görsün diye ortak.
function linkSkills(targetDir) {
  const claudeDir  = path.join(targetDir, '.claude');
  const skillsLink = path.join(claudeDir, 'skills');
  fs.mkdirSync(skillsLink, { recursive: true });

  for (const skill of SKILL_NAMES) {
    const src = path.join(SKILLS_DIR, skill);
    const dst = path.join(skillsLink, skill);
    if (!fs.existsSync(dst) && fs.existsSync(src)) {
      try { fs.symlinkSync(src, dst); } catch {}
    }
  }

  const mdSrc = path.join(SKILLS_DIR, '.claude', 'CLAUDE.md');
  const mdDst = path.join(claudeDir, 'CLAUDE.md');
  if (fs.existsSync(mdSrc) && !fs.existsSync(mdDst)) {
    try { fs.copyFileSync(mdSrc, mdDst); } catch {}
  }
}

function startClaudeProcess(ws, wsId, mode, opts = {}) {
  const model  = ALLOWED_MODELS.includes(opts.model)   ? opts.model  : null;
  const effort = ALLOWED_EFFORTS.includes(opts.effort) ? opts.effort : null;
  const resumeSessionId = opts.resumeSessionId || null;

  const sessionId = resumeSessionId || uuidv4();

  // Kullanıcı çalışma dizini: session klasörü içinde
  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  linkSkills(sessionDir);

  // İlk sistem mesajı — Türkçe + mod yönlendirmesi
  // Yalnızca arayüzdeki hazır tuşların karşılıkları.
  // Buradan kaldırılan yetenekler kaybolmaz: academic-pipeline (tam süreç),
  // academic-paper'ın plan/outline/revision modları ve academic-pptx-skill
  // serbest metinle istendiğinde Claude tarafından zaten bulunup kullanılır.
  const modeHints = {
    arastirma: 'deep-research full mode — sistematik literatür taraması yap',
    makale:    'academic-paper full mode — baştan sona akademik makale yaz',
    nitel:     'grad-grounded-theory — nitel veri analizi: açık/eksenel/seçici kodlama, '
             + 'kod defteri/kod sistemi ve NVivo ya da MAXQDA’ya aktarılabilir çıktı',
    hakem:     'academic-paper-reviewer full mode — 5 perspektiften hakem incelemesi yap',
  };
  const modeHint = mode ? (modeHints[mode] || null) : null;

  const appendPrompt = `Sen Türkçe konuşan bir akademik araştırma asistanısın.
Tüm yanıtlarını Türkçe ver. Akademik içerik (atıflar, terimler) gerektiğinde İngilizce
olabilir ama açıklamalar Türkçe olmalı. Düşünme/ara adım cümlelerini ("Let me...",
"I'll now...") kullanıcıya yazma; sadece sonucu ver.
${modeHint ? `Aktif mod: ${modeHint}.` : ''}

${ALAN_BAGLAMI}

DOSYA ÜRETİMİ
Kullanıcı bir belge/tablo/sunum isterse dosyayı çalışma klasörüne yaz; kullanıcı
onu arayüzdeki "Dosyalar" bölümünden indirir. Dosya yolunu metin olarak vermen
yeterli değil — dosyayı gerçekten oluştur.
Kurulu kütüphaneler (NODE_PATH ayarlı, doğrudan require edilir):
- pptxgenjs → .pptx     - docx → .docx
- exceljs   → .xlsx     - html-to-docx → HTML'den .docx
PDF için: Chrome headless ile HTML'den üretilebilir.
npm install ETME; bu kütüphaneler zaten kurulu. Gerekmedikçe dosya üretme.

SORU SORMA PROTOKOLÜ
Kapsamlı bir işe (makale, plan, tarama, inceleme, sunum) başlamadan önce netleşmesi
gereken şeyler varsa, düz metinle SORMA. Bunun yerine yanıtın SADECE şu blok olsun:

\`\`\`a3i-soru
{"questions":[{"header":"Kısa etiket","question":"Soru cümlesi?","multiSelect":false,"options":[{"label":"Seçenek","description":"Ne anlama geldiği"}]}]}
\`\`\`

Kurallar:
- En fazla 3 soru; her soruda 2-4 seçenek.
- "header" en fazla 14 karakter (pop-up'ta etiket olarak görünür).
- Kullanıcı zaten "Diğer" seçip serbest metin yazabiliyor — sen "Diğer"/"Başka"
  seçeneği EKLEME.
- Birden fazla seçenek işaretlenebilecekse "multiSelect": true ver.
- Bloğun dışına tek kelime bile yazma. Blok geldiğinde kullanıcıya pop-up gösterilir,
  metin olarak görünmez.
- Cevaplar geldikten sonra soru sormadan işe başla.
- Sadece cevap işi gerçekten değiştirecekse sor; makul varsayımla ilerleyebiliyorsan sorma.
- Sorulardan EN FAZLA BİRİ alana özgü olsun (alt alan, branş, örneklem, ölçüm
  gibi ALAN BAĞLAMI'na dayanan sorular). Kalan sorular işin genel biçimini
  netleştirsin: çalışma/makale türü, dil, kapsam ve uzunluk, hedef dergi düzeyi,
  elde hazır veri veya literatür olup olmadığı, istenen çıktı biçimi, teslim
  önceliği. Üç sorunun üçü birden spor bilimlerine dair OLMASIN.
- Şıklar somut olsun (ör. "Elit futbolcu (18-25 yaş)", "Ölçek uyarlama",
  "6.000-8.000 kelime"). "Genel", "Belirsiz", "Diğer alan" gibi içi boş şıklar
  koyma — kullanıcı zaten serbest metin yazabiliyor.
- Çalışma deseni veya makale türü soruyorsan şıklardan biri MUTLAKA nitel
  araştırma olsun (ör. "Nitel — görüşme/odak grup"). Nicel desenlerle
  doldurup nitel seçeneğini atlama.
- Yöntem belli olduktan sonra, o yöntemin GERÇEK karar noktalarını da sor;
  kendi başına seçip geçme. Bu kararlar sonucu doğrudan değiştirir:
  · Nitel çalışmaların HEPSİNDE: analiz hangi yazılımla yürütülüyor —
    NVivo mu, MAXQDA mı, yazılımsız (elle/Word-Excel) mi? Bu soruyu atlama;
    çıktının biçimi ve terminoloji buna göre değişir.
  · Gömülü kuram: Glaser'ci (kuram veriden kendiliğinden belirir, literatür
    taraması ertelenir) mi, Strauss'çu (yapılandırılmış paradigma modeli:
    nedensel koşullar-bağlam-strateji-sonuç) mu? Amaç kuram geliştirmek mi,
    yoksa tema betimlemek mi? Teorik doygunluk mu yoksa sabit örneklem mi?
  · Sistematik derleme: hangi veri tabanları, PRISMA akışı, dahil/hariç
    ölçütleri, tarih aralığı
  · Ölçek geliştirme/uyarlama: dilsel eşdeğerlik, AFA mı DFA mı, hangi
    güvenirlik katsayıları
  · Deneysel: kontrol grubu türü, körleme, etki büyüklüğü hesabı
  · Hakem incelemesi: hangi perspektifler, hangi dergi ölçütleri`;

  const claudeArgs = [
    '--print',
    '--verbose',
    '--output-format', 'stream-json',
    '--input-format', 'stream-json',
    '--include-partial-messages',
    '--dangerously-skip-permissions',
    '--append-system-prompt', appendPrompt,
  ];

  // Resume ederken --session-id verilmez; --resume zaten session'ı belirler
  if (resumeSessionId) claudeArgs.push('--resume', resumeSessionId);
  else                 claudeArgs.push('--session-id', sessionId);

  if (model)  claudeArgs.push('--model', model);
  if (effort) claudeArgs.push('--effort', effort);

  console.log(`[${wsId}] Claude Code başlatılıyor — session: ${sessionId}${resumeSessionId ? ' (resume)' : ''}, mod: ${mode}, model: ${model || 'varsayılan'}, effort: ${effort || 'varsayılan'}`);
  console.log(`[${wsId}] Çalışma dizini: ${sessionDir}`);

  const proc = spawn('claude', claudeArgs, {
    cwd: sessionDir,
    // Oturum klasörü backend/node_modules'ın altında değil; kurulu dosya üretme
    // kütüphaneleri ancak NODE_PATH ile require edilebilir. Bu olmadan Claude
    // her seferinde npm install etmeye kalkıyor (yavaş ve internet gerektiriyor).
    env: { ...process.env, NODE_PATH: path.join(__dirname, 'node_modules') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const entry = { proc, sessionId, buffer: '', initialized: false, ws, streamedLen: 0, model, effort, mode: mode || null };

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
    // Bu süreç artık aktif değilse (kasıtlı sonlandırma / model değişimi) sessizce çık —
    // yoksa yerine geçen süreci haritadan siler ve istemciyi boşuna 'done' ile düşürür.
    if (activeProcs.get(wsId) !== entry) return;
    activeProcs.delete(wsId);

    // Resume denemesi hiç başlayamadan öldüyse: temiz session ile bir kez tekrar dene.
    if (resumeSessionId && !entry.initialized && entry.retryOpts && entry.lastText) {
      console.log(`[${wsId}] Resume tutmadı (kod ${code}) — temiz session ile tekrar deneniyor`);
      const { mode: m, model: mo, effort: ef } = entry.retryOpts;
      const fresh = startClaudeProcess(entry.ws, wsId, m, { model: mo, effort: ef });
      fresh.history = entry.history;
      activeProcs.set(wsId, fresh);
      sendToProc(entry.ws, wsId, fresh, entry.lastText);
      return;
    }

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
      // Bu turda üretilen dosyaları kalıcı klasöre al; sessions/ her açılışta
      // siliniyor ve arayüzden erişilemiyor.
      try {
        const yeni = harvestFiles(entry);
        if (yeni.length) send(ws, { type: 'files_created', files: yeni });
      } catch (e) { console.error('[dosya] toplama hatası:', e.message); }
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

// ── Sunum üretimi (PPTX) ───────────────────────────────────────
// Sohbette yazılmış makaleyi academic-pptx-skill ile akademik sunuma çevirir.
// Metin argv'den değil dosyadan okutulur (uzun makaleler argüman sınırını aşar).
app.post('/api/prepare-pptx', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Metin gerekli' });

  const id = uuidv4().slice(0, 8);
  const workDir = path.join(DOWNLOADS_DIR, 'pptx-' + id);

  try {
    fs.mkdirSync(workDir, { recursive: true });
    linkSkills(workDir);
    fs.writeFileSync(path.join(workDir, 'makale.md'), text, 'utf8');

    const prompt = `Bu klasördeki "makale.md" dosyasında sohbette yazılmış akademik bir metin var.

GÖREV: academic-pptx-skill'i kullanarak bu metni akademik bir sunuma dönüştür ve
sonucu bu klasöre "sunum.pptx" adıyla yaz.

KURALLAR:
- İçeriği YALNIZCA makale.md'den çıkar. Yeni bulgu, veri, sayı veya kaynak UYDURMA.
- Metinde olmayan bir bilgi gerekiyorsa slaytta [köşeli parantez] ile yer tutucu bırak.
- Slayt metinleri Türkçe olsun.
- pptxgenjs zaten kurulu ve NODE_PATH ayarlı — npm install ETME, doğrudan
  require('pptxgenjs') ile kullan.
- Soru sorma, onay bekleme; doğrudan dosyayı üret.
- Bitirince yalnızca kısa bir Türkçe özet yaz: kaç slayt ve slayt başlıkları.`;

    const { code, err } = await runClaudeIn(workDir, prompt, 300000);

    // Skill dosyayı alt klasöre yazmış olabilir — klasör ağacında ara
    const pptx = findFirstFile(workDir, '.pptx');
    if (!pptx) {
      console.error(`[pptx] Üretilemedi (kod ${code}) ${err ? '— ' + err.slice(0, 300) : ''}`);
      return res.status(500).json({ error: 'Sunum üretilemedi. Metin çok kısa olabilir veya Claude tamamlayamadı.' });
    }

    const outName = 'a3i-sunum-' + id + '.pptx';
    fs.copyFileSync(pptx, path.join(DOWNLOADS_DIR, outName));
    const slides = countSlides(path.join(DOWNLOADS_DIR, outName));
    console.log(`[pptx] Üretildi: ${outName} (${slides} slayt)`);
    res.json({ pptxFile: outName, slides });
  } catch (e) {
    console.error('[pptx] Hata:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
});

// Claude'u verilen klasörde tek seferlik çalıştırır (dosya üretimi için).
function runClaudeIn(cwd, prompt, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['--print', '--dangerously-skip-permissions', prompt], {
      cwd,
      // pptxgenjs backend/node_modules'ta; çalışma klasörü onun altında olmadığı
      // için require() ancak NODE_PATH ile çözülür.
      env: { ...process.env, NODE_PATH: path.join(__dirname, 'node_modules') },
    });
    let out = '', err = '';
    let done = false;
    const finish = fn => (...a) => { if (!done) { done = true; clearTimeout(t); fn(...a); } };

    proc.stdout.on('data', d => out += d.toString());
    proc.stderr.on('data', d => err += d.toString());
    proc.on('close', finish(code => resolve({ code, out, err })));
    proc.on('error', finish(e => reject(e)));
    const t = setTimeout(finish(() => {
      try { proc.kill('SIGKILL'); } catch {}
      reject(new Error('Sunum üretimi zaman aşımına uğradı (5 dk)'));
    }), timeoutMs);
  });
}

// Klasör ağacında verilen uzantıya sahip ilk dosyayı bulur.
function findFirstFile(dir, ext, depth = 0) {
  if (depth > 4) return null;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    if (e.name === '.claude' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isFile() && e.name.toLowerCase().endsWith(ext)) return p;
    if (e.isDirectory()) {
      const found = findFirstFile(p, ext, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// PPTX bir zip'tir; slayt sayısını içindeki slideN.xml girdilerinden sayar.
function countSlides(file) {
  try {
    const buf = fs.readFileSync(file);
    return (buf.toString('latin1').match(/ppt\/slides\/slide\d+\.xml/g) || [])
      .filter((v, i, a) => a.indexOf(v) === i).length;
  } catch { return 0; }
}

// ── Üretilen dosyalar ──────────────────────────────────────────
// Claude oturum klasöründe dosya üretir; orası her açılışta silindiği ve
// arayüzden erişilemediği için üretilenler downloads/ altına taşınır.
const GIZLI_UZANTILAR = ['.html', '.log', '.tmp', '.lock'];

function harvestFiles(entry) {
  const dir = safeSessionPath(entry.sessionId);
  if (!dir || !fs.existsSync(dir)) return [];

  if (!entry.gorulenDosyalar) entry.gorulenDosyalar = new Set();
  const bulunan = [];

  const gez = (klasor, derinlik = 0) => {
    if (derinlik > 4) return;
    let girdiler = [];
    try { girdiler = fs.readdirSync(klasor, { withFileTypes: true }); } catch { return; }
    for (const g of girdiler) {
      if (g.name.startsWith('.') || g.name === 'node_modules') continue;
      const p = path.join(klasor, g.name);
      if (g.isDirectory()) { gez(p, derinlik + 1); continue; }
      if (!g.isFile()) continue;
      if (entry.gorulenDosyalar.has(p)) continue;
      entry.gorulenDosyalar.add(p);
      if (GIZLI_UZANTILAR.includes(path.extname(g.name).toLowerCase())) continue;
      bulunan.push(p);
    }
  };
  gez(dir);

  const tasinan = [];
  for (const kaynak of bulunan) {
    try {
      const taban = path.basename(kaynak);
      let hedefAd = taban;
      // Ad çakışırsa kısa bir sonek ekle (üzerine yazma)
      if (fs.existsSync(path.join(DOWNLOADS_DIR, hedefAd))) {
        const ext = path.extname(taban);
        hedefAd = `${path.basename(taban, ext)}-${uuidv4().slice(0, 4)}${ext}`;
      }
      fs.copyFileSync(kaynak, path.join(DOWNLOADS_DIR, hedefAd));
      tasinan.push(hedefAd);
      console.log(`[dosya] Üretildi: ${hedefAd}`);
    } catch (e) { console.error('[dosya] kopyalanamadı:', e.message); }
  }
  return tasinan;
}

// downloads/ içeriğini listeler. Ara/geçici dosyalar gizlenir.
app.get('/api/files', (req, res) => {
  try {
    const dosyalar = fs.readdirSync(DOWNLOADS_DIR, { withFileTypes: true })
      .filter(d => d.isFile() && !d.name.startsWith('.'))
      .filter(d => !GIZLI_UZANTILAR.includes(path.extname(d.name).toLowerCase()))
      .map(d => {
        const st = fs.statSync(path.join(DOWNLOADS_DIR, d.name));
        return { name: d.name, size: st.size, ts: st.mtimeMs };
      })
      .sort((a, b) => b.ts - a.ts);
    res.json(dosyalar);
  } catch { res.json([]); }
});

app.delete('/api/files/:file', (req, res) => {
  const p = safePathIn(DOWNLOADS_DIR, req.params.file);
  if (!p) return res.status(400).json({ error: 'Geçersiz dosya adı' });
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/download/:file', (req, res) => {
  const filePath = safePathIn(DOWNLOADS_DIR, req.params.file);
  if (!filePath) return res.status(400).json({ error: 'Geçersiz dosya adı' });
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

// Sohbet arama — hem klasör adında (başlık) hem mesaj içeriğinde arar.
// '/api/chats/:name' ile çakışmaması için ayrı yol kullanılıyor.
app.get('/api/chats-search', (req, res) => {
  const q = String(req.query.q || '').trim().toLocaleLowerCase('tr');
  if (q.length < 2) return res.json([]);
  try {
    const dirs = fs.readdirSync(CHATS_DIR)
      .filter(f => fs.statSync(path.join(CHATS_DIR, f)).isDirectory());

    const results = [];
    for (const name of dirs) {
      const titleHit = name.toLocaleLowerCase('tr').includes(q);
      let snippet = null;

      const logFile = path.join(CHATS_DIR, name, 'conversation.jsonl');
      if (fs.existsSync(logFile)) {
        for (const line of fs.readFileSync(logFile, 'utf8').split('\n')) {
          if (!line.trim()) continue;
          try {
            const m = JSON.parse(line);
            const text = m.text || '';
            const idx = text.toLocaleLowerCase('tr').indexOf(q);
            if (idx !== -1) {
              const start = Math.max(0, idx - 40);
              snippet = (start > 0 ? '…' : '')
                + text.slice(start, idx + q.length + 60).replace(/\s+/g, ' ').trim() + '…';
              break;
            }
          } catch {}
        }
      }
      if (titleHit || snippet) results.push({ name, snippet, titleHit });
    }
    res.json(results.slice(0, 40));
  } catch { res.json([]); }
});

app.get('/api/chats/:name', (req, res) => {
  const logFile = safeChatPath(req.params.name, 'conversation.jsonl');
  if (!logFile) return res.status(400).json({ error: 'Geçersiz sohbet adı' });
  try {
    if (!fs.existsSync(logFile)) return res.json([]);
    const msgs = fs.readFileSync(logFile, 'utf8').trim().split('\n')
      .filter(Boolean).map(l => JSON.parse(l));
    res.json(msgs);
  } catch { res.json([]); }
});

app.post('/api/chats/:name/message', (req, res) => {
  const chatPath = safeChatPath(req.params.name);
  if (!chatPath) return res.status(400).json({ error: 'Geçersiz sohbet adı' });
  try {
    const { role, text } = req.body;
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
  const chatPath = safeChatPath(req.params.name);
  if (!chatPath) return res.status(400).json({ error: 'Geçersiz sohbet adı' });
  try {
    const { sessionId } = req.body;
    // session_id.txt sonradan SESSIONS_DIR ile birleştiriliyor — burada doğrula.
    if (!safeSessionPath(sessionId)) return res.status(400).json({ error: 'Geçersiz session id' });
    fs.mkdirSync(chatPath, { recursive: true });
    fs.writeFileSync(path.join(chatPath, 'session_id.txt'), sessionId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/chats/:name/rename', (req, res) => {
  const oldPath = safeChatPath(req.params.name);
  if (!oldPath) return res.status(400).json({ error: 'Geçersiz sohbet adı' });
  try {
    const { newName } = req.body;
    if (typeof newName !== 'string') return res.status(400).json({ error: 'Geçersiz isim' });
    const sanitized = newName.replace(/[/\\:*?"<>|.]/g, '').trim().slice(0, 50);
    const newPath = safeChatPath(sanitized);
    if (!newPath) return res.status(400).json({ error: 'Geçersiz isim' });
    if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'Bulunamadı' });
    if (fs.existsSync(newPath)) return res.status(409).json({ error: 'Bu isim zaten var' });
    fs.renameSync(oldPath, newPath);
    res.json({ ok: true, newName: sanitized });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/chats/:name', (req, res) => {
  const name = req.params.name;
  const chatPath = safeChatPath(name);
  if (!chatPath) return res.status(400).json({ error: 'Geçersiz sohbet adı' });
  try {
    // Session klasörünü de sil
    const sessionIdFile = path.join(chatPath, 'session_id.txt');
    if (fs.existsSync(sessionIdFile)) {
      const sessionId = fs.readFileSync(sessionIdFile, 'utf8').trim();
      const sessionPath = safeSessionPath(sessionId);
      if (sessionPath && fs.existsSync(sessionPath)) {
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
  const file = safeChatPath(req.params.name, 'session_id.txt');
  if (!file) return res.status(400).json({ error: 'Geçersiz sohbet adı' });
  try {
    if (!fs.existsSync(file)) return res.json({ sessionId: null });
    const sessionId = fs.readFileSync(file, 'utf8').trim();
    const sessionPath = safeSessionPath(sessionId);
    if (!sessionPath || !fs.existsSync(sessionPath)) return res.json({ sessionId: null });
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
