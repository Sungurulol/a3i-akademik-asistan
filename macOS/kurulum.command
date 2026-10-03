#!/bin/bash
# ═══════════════════════════════════════════════
#  A³I — Akademik Asistan AI
#  macOS Kurulum Scripti
#  Bir kere çalıştırmanız yeterli.
# ═══════════════════════════════════════════════

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Homebrew ve Claude Code klasörleri PATH'te olmayabilir (yeni kurulum ya da
# .zprofile yüklenmemiş bir kabuk).
for d in "$HOME/.local/bin" /usr/local/bin /opt/homebrew/bin; do
  if [ -d "$d" ]; then
    case ":$PATH:" in *":$d:"*) ;; *) PATH="$d:$PATH" ;; esac
  fi
done
export PATH
# git hiçbir zaman ekranda görünmeyen bir kullanıcı adı/şifre sorusunda beklemesin.
export GIT_TERMINAL_PROMPT=0

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
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
step() { echo ""; echo -e "  ${BLUE}━━━ $1 ━━━${NC}"; }
fail_exit() {
  fail "$1"
  echo ""
  echo "  Yukarıdaki mesajları kontrol edip kurulum.command'ı yeniden çalıştırın."
  echo "  Enter ile kapatın..."
  read -r
  exit 1
}

# ── Homebrew ─────────────────────────────────
step "Homebrew"
if command -v brew &>/dev/null; then
  ok "Homebrew zaten kurulu"
else
  info "Homebrew kuruluyor..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    grep -qs 'brew shellenv' ~/.zprofile || echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
  command -v brew &>/dev/null || fail_exit "Homebrew kurulamadı"
  ok "Homebrew kuruldu"
fi

# ── Git ──────────────────────────────────────
# /usr/bin/git, Komut Satırı Araçları yoksa yalnızca bir yükleme penceresi
# açan bir kısayoldur; gerçekten çalışıp çalışmadığına bakılır.
step "Git"
if git --version &>/dev/null; then
  ok "Git kurulu"
else
  info "Git kuruluyor..."
  brew install git
  hash -r
  git --version &>/dev/null || fail_exit "Git kurulamadı"
  ok "Git kuruldu"
fi

# ── Node.js (18+) ────────────────────────────
step "Node.js"
node_ok() {
  command -v node &>/dev/null &&
    node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)" 2>/dev/null
}
if node_ok; then
  ok "Node.js kurulu ($(node --version))"
else
  info "Node.js kuruluyor..."
  brew install node
  hash -r
  node_ok || fail_exit "Node.js 18 veya üstü kurulamadı"
  ok "Node.js kuruldu ($(node --version))"
fi

# ── Python (3.10+) & MarkItDown ──────────────
# macOS'taki /usr/bin/python3 genelde 3.9'dur; MarkItDown 3.10+ ister.
step "Python & MarkItDown"
PY=""
find_python() {
  local c
  for c in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$c" &>/dev/null &&
       "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
      PY="$(command -v "$c")"
      return 0
    fi
  done
  return 1
}
if find_python; then
  ok "Python kurulu ($("$PY" --version 2>&1))"
else
  info "Python kuruluyor..."
  brew install python@3.13
  hash -r
  if find_python; then ok "Python kuruldu"; else warn "Python kurulamadı"; fi
fi

# Homebrew Python'u `pip install --user`'ı reddeder (PEP 668). MarkItDown
# uygulamaya özel bir sanal ortama (.venv) kurulur.
if [ -n "$PY" ]; then
  info "MarkItDown kuruluyor (dosya işleme için, birkaç dakika sürebilir)..."
  VENV="$SCRIPT_DIR/.venv"
  md_install() {
    [ -x "$VENV/bin/python" ] &&
      "$VENV/bin/python" -m pip install --upgrade --disable-pip-version-check \
        'markitdown[pdf,docx,pptx,xlsx]' </dev/null
  }
  [ -x "$VENV/bin/python" ] || "$PY" -m venv "$VENV"
  # Önceki yarım bir denemeden kalan bozuk sanal ortam: sıfırdan oluşturulur.
  if md_install || { info "Sanal ortam yeniden oluşturuluyor..."; "$PY" -m venv --clear "$VENV" && md_install; }; then
    ok "MarkItDown kuruldu"
  else
    warn "MarkItDown kurulamadı — Word/Excel/PowerPoint yükleme çalışmayabilir"
  fi
else
  warn "Python olmadan MarkItDown kurulamadı — Word/Excel/PowerPoint yükleme çalışmayabilir"
fi

# ── Java (11+, PDF işleme için) ──────────────
# /usr/bin/java JDK yoksa da vardır ama çalışmaz; `--version` yalnızca
# Java 9+ sürümlerinde çalışır (Java 8 varsa yenisi kurulur).
step "Java"
if java --version &>/dev/null; then
  ok "Java kurulu"
else
  info "Java kuruluyor (Temurin JDK, PDF işleme için)..."
  brew install --cask temurin
  if java --version &>/dev/null; then
    ok "Java kuruldu"
  else
    warn "Java kurulamadı — PDF yükleme çalışmayacak"
  fi
fi

# ── Claude Code ──────────────────────────────
step "Claude Code"
if command -v claude &>/dev/null; then
  ok "Claude Code kurulu"
else
  info "Claude Code kuruluyor..."
  curl -fsSL https://claude.ai/install.sh | bash
  hash -r
  if ! command -v claude &>/dev/null; then
    info "Resmi kurulum başarısız, npm ile deneniyor..."
    npm install -g @anthropic-ai/claude-code
    hash -r
  fi
  command -v claude &>/dev/null || fail_exit "Claude Code kurulamadı"
  ok "Claude Code kuruldu"
fi
# Resmi kurulumun klasörü (~/.local/bin) kalıcı PATH'te yoksa eklenir.
if [ -x "$HOME/.local/bin/claude" ] && ! grep -qs '\.local/bin' ~/.zprofile; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zprofile
fi

# ── npm paketleri ────────────────────────────
step "Backend paketleri"
cd "$SCRIPT_DIR/backend" || fail_exit "backend klasörü bulunamadı"
npm install --silent --no-fund --no-audit || fail_exit "Backend paketleri kurulamadı (npm install)"
cd "$SCRIPT_DIR"
ok "Paketler hazır"

# ── Skills repo ──────────────────────────────
step "Akademik Skill Dosyaları"
SKILLS_DIR="$SCRIPT_DIR/skills/academic-research-skills"
if [ -d "$SKILLS_DIR/.claude" ]; then
  ok "Skills zaten mevcut"
else
  info "GitHub'dan indiriliyor..."
  mkdir -p "$SCRIPT_DIR/skills"
  rm -rf "$SKILLS_DIR"   # yarım kalmış önceki indirme
  git clone --progress https://github.com/Imbad0202/academic-research-skills.git "$SKILLS_DIR"
  [ -d "$SKILLS_DIR/.claude" ] || fail_exit "Skill dosyaları indirilemedi"
  ok "Skills indirildi"
fi

# ── Ek skill: grad-grounded-theory ───────────
if [ -d "$SKILLS_DIR/grad-grounded-theory" ]; then
  ok "grad-grounded-theory skill zaten mevcut"
else
  info "grad-grounded-theory skill indiriliyor..."
  TMP_SKILLS_DIR=$(mktemp -d)
  if git clone --depth 1 --quiet https://github.com/asgard-ai-platform/skills.git "$TMP_SKILLS_DIR" 2>/dev/null \
    && [ -d "$TMP_SKILLS_DIR/grad-grounded-theory" ]; then
    cp -r "$TMP_SKILLS_DIR/grad-grounded-theory" "$SKILLS_DIR/"
    ok "grad-grounded-theory skill indirildi"
  else
    warn "grad-grounded-theory skill indirilemedi"
  fi
  rm -rf "$TMP_SKILLS_DIR"
fi

# ── Ek skill: academic-pptx-skill ────────────
if [ -d "$SKILLS_DIR/academic-pptx-skill" ]; then
  ok "academic-pptx-skill zaten mevcut"
else
  info "academic-pptx-skill indiriliyor..."
  TMP_PPTX_DIR=$(mktemp -d)
  if git clone --depth 1 --quiet https://github.com/Gabberflast/academic-pptx-skill.git "$TMP_PPTX_DIR" 2>/dev/null \
    && [ -f "$TMP_PPTX_DIR/SKILL.md" ]; then
    rm -rf "$TMP_PPTX_DIR/.git"
    cp -r "$TMP_PPTX_DIR" "$SKILLS_DIR/academic-pptx-skill"
    ok "academic-pptx-skill indirildi"
  else
    warn "academic-pptx-skill indirilemedi"
  fi
  rm -rf "$TMP_PPTX_DIR"
fi

# ── Claude oturumu ───────────────────────────
step "Claude Hesabı"
if claude auth status &>/dev/null; then
  ok "Oturum aktif"
else
  echo ""
  echo "  Tarayıcınız açılacak, Anthropic hesabınızla giriş yapın."
  echo "  Hazır olunca Enter'a basın..."
  read -r
  claude auth login
fi

# ── İzinler ──────────────────────────────────
chmod +x "$SCRIPT_DIR/baslat.command" "$SCRIPT_DIR/kurulum.command"
# İnternetten indirilen dosyalardaki karantina işareti kaldırılır; yoksa
# baslat.command ilk açılışta Gatekeeper uyarısına takılır.
xattr -dr com.apple.quarantine "$SCRIPT_DIR" 2>/dev/null || true

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║        Kurulum Tamamlandı! ✓             ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  → 'baslat.command' dosyasına çift tıklayın"
echo ""
echo "  Enter ile kapatın..."
read -r
