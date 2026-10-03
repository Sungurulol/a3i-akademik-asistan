#!/bin/bash
# ═══════════════════════════════════════════════
#  A³I — Akademik Asistan AI
#  macOS Başlatma Scripti
# ═══════════════════════════════════════════════

# Betiğin tamamı main() içinde: bash betiği satır satır okur; aşağıdaki
# `git pull` bu dosyayı değiştirirse okumaya değişmiş dosyadan devam edip
# bozuk komutlar çalıştırırdı. Fonksiyon önceden bütünüyle okunduğu için
# güvenli.
main() {

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Homebrew ve Claude Code klasörleri PATH'te olmayabilir.
for d in "$HOME/.local/bin" /usr/local/bin /opt/homebrew/bin; do
  if [ -d "$d" ]; then
    case ":$PATH:" in *":$d:"*) ;; *) PATH="$d:$PATH" ;; esac
  fi
done
export PATH
# git hiçbir zaman ekranda görünmeyen bir kullanıcı adı/şifre sorusunda beklemesin.
export GIT_TERMINAL_PROMPT=0

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
info() { echo -e "  ${BLUE}→${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
fail_exit() {
  echo -e "  ${RED}✗${NC} $1"
  echo "  Enter ile kapatın..."
  read -r
  exit 1
}

PORT=3000

# ── Kurulum kontrolü ─────────────────────────
[ -d "$SCRIPT_DIR/backend/node_modules" ] || fail_exit "Kurulum bulunamadı. Önce 'kurulum.command' çalıştırın."
command -v node   &>/dev/null || fail_exit "Node.js bulunamadı. Önce 'kurulum.command' çalıştırın."
command -v claude &>/dev/null || fail_exit "Claude Code bulunamadı. Önce 'kurulum.command' çalıştırın."

clear
echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║     A³I — Akademik Asistan AI           ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# ── A³I güncelleme kontrolü ──────────────────
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ -d "$REPO_DIR/.git" ] && git --version &>/dev/null; then
  info "A³I güncellemeleri kontrol ediliyor..."
  OLD_COMMIT=$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null)
  git -C "$REPO_DIR" fetch --quiet 2>/dev/null
  NEW_COMMIT=$(git -C "$REPO_DIR" rev-parse @{u} 2>/dev/null)
  if [ -n "$OLD_COMMIT" ] && [ -n "$NEW_COMMIT" ] && [ "$OLD_COMMIT" != "$NEW_COMMIT" ]; then
    info "Yeni güncelleme bulundu, indiriliyor..."
    git -C "$REPO_DIR" pull --ff-only --quiet
    if [ "$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null)" = "$OLD_COMMIT" ]; then
      warn "Güncelleme uygulanamadı (yerel değişiklikler olabilir). Mevcut sürümle devam ediliyor."
    else
      if git -C "$REPO_DIR" diff --name-only "$OLD_COMMIT" HEAD | grep -q "macOS/kurulum.command"; then
        info "Kurulum güncellendi, yeniden kuruluyor..."
        bash "$SCRIPT_DIR/kurulum.command"
      fi
      info "Bağımlılıklar güncelleniyor..."
      (cd "$SCRIPT_DIR/backend" && npm install --silent --no-fund --no-audit)
      ok "A³I güncellendi"
    fi
  else
    ok "A³I güncel"
  fi
fi

# ── Skills güncelle ──────────────────────────
SKILLS_DIR="$SCRIPT_DIR/skills/academic-research-skills"
if ! git --version &>/dev/null; then
  warn "Git bulunamadı, skill güncellemesi atlandı"
elif [ -d "$SKILLS_DIR/.git" ]; then
  info "Akademik skill dosyaları güncelleniyor..."
  git -C "$SKILLS_DIR" pull --ff-only --quiet 2>/dev/null || true
  ok "Skills güncel"
else
  info "Skills indiriliyor..."
  mkdir -p "$SCRIPT_DIR/skills"
  if git clone --progress https://github.com/Imbad0202/academic-research-skills.git "$SKILLS_DIR"; then
    ok "Skills indirildi"
  else
    warn "Skills indirilemedi"
  fi
fi

# ── Claude oturumu yenile ────────────────────
info "Claude oturumu yenileniyor..."
claude auth logout &>/dev/null
claude auth login
ok "Oturum yenilendi"

# ── Önceki oturumu temizle ───────────────────
# Yalnızca eski A³I sunucusu kapatılır; port başka bir programdaysa ona
# dokunulmaz.
stop_server() {
  local busy=0 pid
  for pid in $(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null); do
    if ps -o command= -p "$pid" 2>/dev/null | grep -q "backend/server.js"; then
      kill "$pid" 2>/dev/null
    else
      busy=1
    fi
  done
  sleep 0.5
  return $busy
}
stop_server || fail_exit "$PORT portu başka bir program tarafından kullanılıyor. O programı kapatıp yeniden deneyin."

# ── Backend başlat ───────────────────────────
info "Sunucu başlatılıyor..."
node "$SCRIPT_DIR/backend/server.js" &
BACKEND_PID=$!
trap 'kill "$BACKEND_PID" 2>/dev/null' EXIT
trap 'exit 130' INT TERM HUP

# Hazır olmasını bekle (en fazla ~20 sn)
READY=0
for i in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:$PORT/api/health" &>/dev/null; then READY=1; break; fi
  kill -0 "$BACKEND_PID" 2>/dev/null || break   # sunucu çöktüyse bekleme
  sleep 0.5
done
[ "$READY" = 1 ] || fail_exit "Sunucu başlatılamadı. Yukarıdaki hata mesajlarına bakın."

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

wait "$BACKEND_PID"
}

main "$@"
exit
