#!/bin/bash
# ═══════════════════════════════════════════════
#  A³I — Akademik Asistan AI
#  macOS Başlatma Scripti
# ═══════════════════════════════════════════════

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
info() { echo -e "  ${BLUE}→${NC} $1"; }

PORT=3000

# ── Kurulum kontrolü ─────────────────────────
if [ ! -d "$SCRIPT_DIR/backend/node_modules" ]; then
  echo -e "  ${RED}✗${NC} Kurulum bulunamadı. Önce 'kurulum.command' çalıştırın."
  read -r; exit 1
fi

if ! command -v claude &>/dev/null; then
  echo -e "  ${RED}✗${NC} Claude Code bulunamadı. Önce 'kurulum.command' çalıştırın."
  read -r; exit 1
fi

clear
echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║     A³I — Akademik Asistan AI           ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# ── A³I güncelleme kontrolü ──────────────────
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ -d "$REPO_DIR/.git" ]; then
  echo "  → A³I güncellemeleri kontrol ediliyor..."
  cd "$REPO_DIR"
  OLD_COMMIT=$(git rev-parse @ 2>/dev/null)
  git fetch --quiet 2>/dev/null
  NEW_COMMIT=$(git rev-parse @{u} 2>/dev/null)
  if [ -n "$OLD_COMMIT" ] && [ -n "$NEW_COMMIT" ] && [ "$OLD_COMMIT" != "$NEW_COMMIT" ]; then
    echo "  → Yeni güncelleme bulundu, indiriliyor..."
    git pull --quiet
    if git diff --name-only "$OLD_COMMIT" "$NEW_COMMIT" | grep -q "kurulum.command"; then
      echo "  → Kurulum güncellendi, yeniden kuruluyor..."
      bash "$SCRIPT_DIR/kurulum.command"
    fi
    echo "  → Bağımlılıklar güncelleniyor..."
    cd "$SCRIPT_DIR/backend" && npm install --silent 2>/dev/null
    cd "$SCRIPT_DIR"
    echo "  ✓ A³I güncellendi"
  else
    echo "  ✓ A³I güncel"
  fi
fi

# ── Skills güncelle ──────────────────────────
SKILLS_DIR="$SCRIPT_DIR/skills/academic-research-skills"
if [ -d "$SKILLS_DIR/.git" ]; then
  info "Akademik skill dosyaları güncelleniyor..."
  cd "$SKILLS_DIR"
  git pull --quiet origin main 2>/dev/null || git pull --quiet origin master 2>/dev/null || true
  cd "$SCRIPT_DIR"
  ok "Skills güncel"
  
else
  info "Skills indiriliyor..."
  mkdir -p "$SCRIPT_DIR/skills"
  git clone https://github.com/Imbad0202/academic-research-skills.git "$SKILLS_DIR"
  ok "Skills indirildi"
fi

# ── Claude oturumu yenile ────────────────────
info "Claude oturumu yenileniyor..."
claude auth logout &>/dev/null
claude auth login
ok "Oturum yenilendi"

# ── Önceki oturumu temizle ───────────────────
lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
# ── Backend başlat ───────────────────────────
info "Sunucu başlatılıyor..."
node "$SCRIPT_DIR/backend/server.js" &
BACKEND_PID=$!

# Hazır olmasını bekle
for i in $(seq 1 20); do
  if curl -s "http://localhost:$PORT/api/health" &>/dev/null; then break; fi
  sleep 0.5
done

ok "Sunucu hazır"
info "Tarayıcı açılıyor..."
sleep 0.3
open "http://localhost:$PORT"

echo ""
ok "A³I çalışıyor — http://localhost:$PORT"
echo ""
echo "  ─────────────────────────────────────────"
echo "  Durdurmak için: Ctrl+C veya pencereyi kapat"
echo "  ─────────────────────────────────────────"
echo ""

wait $BACKEND_PID
