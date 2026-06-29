<div align="center">

# A³I — Akademik Asistan AI

![versiyon](https://img.shields.io/badge/versiyon-2.0.0-blue?style=flat-square)
![lisans](https://img.shields.io/badge/lisans-CC%20BY--NC%204.0-gray?style=flat-square)
![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgray?style=flat-square)
![claude](https://img.shields.io/badge/Claude%20Code%20üzerine-kurulu-orange?style=flat-square)
[![x](https://img.shields.io/badge/takip%20et-%40sungurulol-black?style=flat-square&logo=x)](https://x.com/sungurulol)

**Claude Code üzerine inşa edilmiş, yerel çalışan akademik araştırma asistanı.**  
Derin literatür taraması · Makale yazımı · Hakem incelemesi · Tam pipeline — hepsi web arayüzünden.

> [Cheng-I Wu](https://github.com/Imbad0202) tarafından geliştirilen [Academic Research Skills](https://github.com/Imbad0202/academic-research-skills) üzerine inşa edilmiştir — [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)

---

[🇬🇧 English](README.md) · [📦 İndir](#kurulum) · [🚀 Hızlı Başlangıç](#kullanım)

</div>

---

## A³I Nedir?

A³I, **yerel çalışan** bir akademik araştırma asistanıdır. Tamamen kendi bilgisayarınızda çalışır — verileriniz hiçbir yere gitmez. Claude Code'un çok ajanlı pipeline'ı sayesinde araştırmadan yayına hazır çıktıya kadar tüm akademik iş akışını yönetir.

```
Araştırma → Yazım → Bütünlük Kontrolü → Hakem İncelemesi → Revizyon → Finalizasyon
```

---

## Özellikler

| | Özellik | Açıklama |
|---|---|---|
| 🔍 | **Derin Araştırma** | 13 ajanlı sistematik literatür taraması, PRISMA metodolojisi, APA 7.0 |
| ✍️ | **Makale Yaz** | Baştan sona akademik makale, atıf kontrolü |
| ⭐ | **Hakem İncele** | 5 perspektiften peer review, 0–100 kalite puanı |
| 🔁 | **Tam Sistem** | Araştırma → Yazım → İnceleme → Revizyon → Finalizasyon |
| 📄 | **DOCX & PDF İndirme** | LaTeX kalitesinde akademik format, içeriğe dokunulmadan |
| 💬 | **Canlı Streaming** | Token'lar üretilirken ekranda görünür, canlı token sayacı, canlı skill/araç göstergesi |
| 💾 | **Yerel Bellek** | Sohbetler `Chats/` klasörüne kaydedilir, uygulama yeniden açılınca yüklenir |
| 🔄 | **Bağlam Sürekliliği** | Eski sohbet açılınca geçmiş konuşma context olarak enjekte edilir |
| 📎 | **Akıllı Dosya İşleme** | Yüklenen dosyalar (PDF, DOCX, PPTX, XLSX) MarkItDown ile temiz Markdown'a çevrilir — ham metne göre çok daha az token harcar |
| ⚠️ | **Limit Farkındalığı** | Kullanım limitine yaklaşılınca veya dolunca görünür sarı/kırmızı uyarı şeridi |
| 🔐 | **Otomatik Oturum Yenileme** | Her başlatmada Claude girişi otomatik yenilenir, eski token'dan kaynaklanan 401 hataları önlenir |
| 🇹🇷 | **Türkçe Arayüz** | Tam Türkçe kullanım |

---

## Kurulum

### macOS

```bash
# 1. macOS/ klasörünü indirin
# 2. kurulum.command dosyasına sağ tıklayın → Aç → Aç
# 3. Ekrandaki adımları takip edin
```

### Windows

```bash
# 1. Windows/ klasörünü indirin
# 2. kurulum.bat dosyasına sağ tıklayın → Yönetici olarak çalıştır
# 3. Ekrandaki adımları takip edin
```

> **Gereksinim:** [Claude](https://claude.ai) hesabı gereklidir. Claude Pro veya Max planı önerilir.

Kurulum otomatik olarak kurar:
- **macOS:** Homebrew · Node.js · Python · MarkItDown · Claude Code
- **Windows:** Chocolatey · Node.js · Python · MarkItDown · Claude Code

---

## Kullanım

```bash
# macOS
baslat.command dosyasına çift tıklayın

# Windows
baslat.bat dosyasına çift tıklayın
```

Tarayıcı otomatik olarak `http://localhost:3000` adresinde açılır.  
Her başlatmada akademik skill dosyaları **otomatik güncellenir** ve Claude oturumunuz **otomatik yenilenir**.

---

## Nasıl Çalışır?

```
┌─────────────────────────────────────────────┐
│           Web Arayüzü (Tarayıcı)            │
│         http://localhost:3000               │
└──────────────────┬──────────────────────────┘
                   │ WebSocket
┌──────────────────▼──────────────────────────┐
│           Node.js Backend                   │
│        (Express + WebSocket)                │
└──────────────────┬──────────────────────────┘
                   │ stream-json
┌──────────────────▼──────────────────────────┐
│   Claude Code (arka planda, yerel çalışır)  │
│   session tabanlı · 13 ajanlı pipeline      │
└──────────────────┬──────────────────────────┘
                   │ her başlatmada git pull
┌──────────────────▼──────────────────────────┐
│     academic-research-skills (Skill'ler)    │
│   github.com/Imbad0202/academic-research-skills │
└─────────────────────────────────────────────┘

Yüklenen dosyalar → MarkItDown → temiz Markdown → prompt'a enjekte edilir
```

---

## Gereksinimler

| | macOS | Windows |
|---|---|---|
| İşletim Sistemi | macOS 12+ | Windows 10/11 |
| Otomatik Kurulan | Homebrew, Node.js, Python, MarkItDown, Claude Code | Chocolatey, Node.js, Python, MarkItDown, Claude Code |
| Hesap | Claude Pro / Max | Claude Pro / Max |

---

## Sürüm Notları

### v2.0.0
- **MarkItDown entegrasyonu** — yüklenen dosyalar (PDF, DOCX, PPTX, XLSX) modele gitmeden önce temiz Markdown'a çevrilir, ham metin çıkarmaya kıyasla token kullanımını önemli ölçüde azaltır
- **Skill/araç göstergesi** — üretim sırasında aktif skill ve araç adı üst çubukta canlı gösterilir
- **Limit uyarı şeridi** — kullanım limitine yaklaşılınca veya dolunca sessizce başarısız olmak yerine görünür sarı/kırmızı bir şerit gösterilir
- **Otomatik oturum yenileme** — her başlatmada `claude auth logout` + `claude auth login` otomatik çalışır, eski token kaynaklı 401 hatalarını önler
- **Windows kurulum eşitliği** — Python ve MarkItDown artık Windows'ta da otomatik kuruluyor

### v1.1.1
- **Bağlam sürekliliği** — eski sohbet açılınca tüm konuşma geçmişi context olarak enjekte edilir, Claude geçmişi hatırlar
- **Session stabilitesi** — uygulama yeniden açılınca oluşan "session already in use" hatası giderildi
- **Sessions temizliği** — eski session klasörleri her açılışta otomatik temizlenir

### v1.1.0
- **Canlı streaming** — token'lar üretilirken ekranda görünür
- **Canlı token sayacı** — üretim sırasında üst çubukta gösterilir
- **WebSocket stabilitesi** — heartbeat sistemi, otomatik yeniden bağlanma
- **Yerel bellek** — sohbetler `Chats/` klasörüne kaydedilir, uygulama yeniden açılınca yüklenir
- **Sohbet yönetimi** — yeniden adlandırma, onay popup'ı ile silme
- **AI destekli sohbet başlıkları** — her konuşma için otomatik 3–5 kelimelik başlık
- **WS durum göstergesi** — yeşil / sarı / kırmızı bağlantı durumu
- **PDF iyileştirmesi** — tüm kullanıcılar için genişletilmiş Chrome yolu tespiti

### v1.0.0
- İlk sürüm
- Claude Code çok ajanlı pipeline entegrasyonu
- LaTeX formatında DOCX & PDF çıktısı
- Türkçe web arayüzü
- macOS & Windows desteği

---

## Teşekkür

Bu proje, [Cheng-I Wu](https://github.com/Imbad0202) tarafından geliştirilen **[Academic Research Skills](https://github.com/Imbad0202/academic-research-skills)** üzerine inşa edilmiştir. Lisans: [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).

Dosya işleme Microsoft'un **[MarkItDown](https://github.com/microsoft/markitdown)** kütüphanesi ile sağlanır, MIT lisanslıdır.

---

## Geliştirici

[@sungurulol](https://x.com/sungurulol) tarafından yapılmıştır.

---

## Lisans

Bu proje [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) lisansı ile yayınlanmıştır — atıf vererek özgürce paylaşılabilir, ticari kullanım yasaktır.
