#!/bin/bash
# ═══════════════════════════════════════════════
#  A³I — Akademik Asistan AI
#  macOS Kurulum Scripti
#  Bir kere çalıştırmanız yeterli.
# ═══════════════════════════════════════════════

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

clear
echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║     A³I — Akademik Asistan AI           ║"
echo "  ║     Kurulum                              ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  İnternet bağlantısı gereklidir."
echo "  Yaklaşık 5-10 dakika sürebilir."
echo ""
echo "  Devam etmek için Enter'a basın..."
read -r

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
info() { echo -e "  ${BLUE}→${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
step() { echo ""; echo -e "  ${BLUE}━━━ $1 ━━━${NC}"; }

# ── Homebrew ─────────────────────────────────
step "Homebrew"
if command -v brew &>/dev/null; then
  ok "Homebrew zaten kurulu"
else
  info "Homebrew kuruluyor..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [[ $(uname -m) == "arm64" ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
  fi
  ok "Homebrew kuruldu"
fi

# ── Node.js ──────────────────────────────────
step "Node.js"
if command -v node &>/dev/null; then
  ok "Node.js kurulu ($(node --version))"
else
  info "Node.js kuruluyor..."
  brew install node
  ok "Node.js kuruldu"
fi

# ── Python & MarkItDown ──────────────────────
step "Python & MarkItDown"
if command -v python3 &>/dev/null; then
  ok "Python3 kurulu ($(python3 --version))"
else
  info "Python3 kuruluyor..."
  brew install python@3.13
  ok "Python3 kuruldu"
fi

info "MarkItDown kuruluyor (dosya işleme için)..."
pip3 install --user --quiet 'markitdown[pdf,docx,pptx,xlsx]' 2>/dev/null
ok "MarkItDown kuruldu"

# ── Java (PDF işleme için) ────────────────────
step "Java"
if command -v java &>/dev/null && java -version &>/dev/null 2>&1; then
  ok "Java kurulu"
else
  fail "Java bulunamadı (PDF işleme için gerekli — opendataloader-pdf, Java 11+ ister)"
  echo "  → Kurmak için: brew install openjdk"
fi

# ── Claude Code ──────────────────────────────
step "Claude Code"
if command -v claude &>/dev/null; then
  ok "Claude Code kurulu"
else
  info "Claude Code kuruluyor..."
  npm install -g @anthropic-ai/claude-code
  ok "Claude Code kuruldu"
fi

# ── npm paketleri ────────────────────────────
step "Backend paketleri"
cd "$SCRIPT_DIR/backend"
npm install --silent
ok "Paketler hazır"
cd "$SCRIPT_DIR"

# ── Skills repo ──────────────────────────────
step "Akademik Skill Dosyaları"
if [ -d "$SCRIPT_DIR/skills/academic-research-skills/.claude" ]; then
  ok "Skills zaten mevcut"
else
  info "GitHub'dan indiriliyor..."
  mkdir -p "$SCRIPT_DIR/skills"
  git clone https://github.com/Imbad0202/academic-research-skills.git \
    "$SCRIPT_DIR/skills/academic-research-skills"
  ok "Skills indirildi"
fi

# ── Claude oturumu ───────────────────────────
step "Claude Hesabı"
if claude auth status &>/dev/null 2>&1; then
  ok "Oturum aktif"
else
  echo ""
  echo "  Tarayıcınız açılacak, Anthropic hesabınızla giriş yapın."
  echo "  Hazır olunca Enter'a basın..."
  read -r
  claude auth login
fi

# ── İzinler ──────────────────────────────────
chmod +x "$SCRIPT_DIR/baslat.command"
chmod +x "$SCRIPT_DIR/kurulum.command"

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║        Kurulum Tamamlandı! ✓             ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  → 'baslat.command' dosyasına çift tıklayın"
echo ""
echo "  Enter ile kapatın..."
read -r
