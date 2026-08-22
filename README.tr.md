<div align="center">

# A³I — Akademik Asistan AI

![versiyon](https://img.shields.io/badge/versiyon-3.0.0-blue?style=flat-square)
![lisans](https://img.shields.io/badge/lisans-CC%20BY--NC%204.0-gray?style=flat-square)
![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgray?style=flat-square)
![claude](https://img.shields.io/badge/Claude%20Code%20üzerine-kurulu-orange?style=flat-square)
[![x](https://img.shields.io/badge/takip%20et-%40sungurulol-black?style=flat-square&logo=x)](https://x.com/sungurulol)

**Claude Code üzerine inşa edilmiş, yerel çalışan akademik araştırma asistanı.**  
Derin literatür taraması · Makale yazımı · Nitel analiz · Hakem incelemesi — hepsi web arayüzünden.

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

Uzun bir işe başlamadan önce A³I size birkaç şıklı soru sorar; böylece sonuç gerçekten istediğiniz şey olur. Tek bir cümle yazmadan, yalnızca şıklara tıklayarak bitmiş bir makaleye ulaşabilirsiniz.

---

## Özellikler

| | Özellik | Açıklama |
|---|---|---|
| 🔍 | **Derin Araştırma** | 13 ajanlı sistematik literatür taraması, PRISMA metodolojisi, APA 7.0 |
| ✍️ | **Makale Yaz** | Baştan sona akademik makale, atıf kontrolü |
| 🏷️ | **Nitel Analiz** | Gömülü kuram (Glaser'ci / Strauss'çu), açık–eksenel–seçici kodlama, **NVivo** ve **MAXQDA**'ya aktarılabilir kod defteri |
| ⭐ | **Hakem İncele** | 5 perspektiften peer review, 0–100 kalite puanı |
| ❓ | **Yönlendirici Sorular** | Uzun metin yerine, işe başlamadan önce en fazla 3 şıklı soru — her birinde "Diğer" alanıyla |
| 🧠 | **Model ve Çaba Kontrolü** | Opus 5 / Sonnet 5 / Haiku 4.5 ve düşünme çabası sohbet ortasında değiştirilebilir; oturum devam ettiği için bağlam korunur |
| 📄 | **DOCX · PDF · PPTX Çıktısı** | LaTeX kalitesinde akademik format, içeriğe dokunulmadan — ve her mesaj sunuma çevrilebilir |
| 📁 | **Dosyalar Bölümü** | Asistanın ürettiği her dosya saklanır ve kenar çubuğundan indirilir, türüne göre renklenir |
| 📎 | **Akıllı Dosya İşleme** | PDF'ler [opendataloader-pdf](https://github.com/opendataloader-project/opendataloader-pdf) ile ayrıştırılır (kıyaslamalarda 1. sırada); DOCX/TXT/MD için MarkItDown. Sürükle-bırak destekli |
| 💬 | **Canlı Streaming** | Token'lar üretilirken görünür; durum göstergesi yüzer, sayfayı hiç kaydırmaz |
| 💾 | **Yerel Bellek** | Sohbetler `Chats/` klasörüne kaydedilir; sabitleme ve başlık + mesaj içeriğinde arama |
| 🌗 | **Açık ve Karanlık Tema** | Apple tasarım diliyle kurulmuş, yay fizikli hareketleri olan uyarlanabilir arayüz |
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
- **macOS:** Homebrew · Node.js · Python · MarkItDown · Java (Temurin) · Claude Code
- **Windows:** Chocolatey · Node.js · Python · MarkItDown · Java (OpenJDK) · Claude Code

> PDF ayrıştırıcısı Java 11+ gerektirir; kurulum bunu sizin için yapar, elle bir adım yok.

---

## Kullanım

```bash
# macOS
baslat.command dosyasına çift tıklayın

# Windows
baslat.bat dosyasına çift tıklayın
```

Tarayıcı otomatik olarak `http://localhost:3000` adresinde açılır.  
Her başlatmada A³I **kendini günceller** (değişiklik varsa kurulumu yeniden çalıştırır), akademik skill dosyalarını **otomatik günceller** ve Claude oturumunuzu **otomatik yeniler**.

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

PDF             → opendataloader-pdf (Java) ─┐
DOCX / TXT / MD → MarkItDown ────────────────┴→ temiz Markdown → prompt'a enjekte edilir

Üretilen dosyalar → downloads/ → kenar çubuğundaki Dosyalar bölümü
```

---

## Gereksinimler

| | macOS | Windows |
|---|---|---|
| İşletim Sistemi | macOS 12+ | Windows 10/11 |
| Otomatik Kurulan | Homebrew, Node.js, Python, MarkItDown, Java 11+, Claude Code | Chocolatey, Node.js, Python, MarkItDown, Java 11+, Claude Code |
| Hesap | Claude Pro / Max | Claude Pro / Max |

---

## Sürüm Notları

### v3.0.0

**Arayüz — yeniden yazıldı**
- Apple tasarım diline göre baştan tasarım: uyarlanabilir **açık ve karanlık tema**, saydam materyal katmanları, sistem mavisi vurgu ve uçuş halindeyken kesilip geri çevrilebilen yay fizikli hareketler
- Çalışma modu kartlarıyla **karşılama ekranı** — boş ekran daha önce tamamen boştu
- Kenar çubuğunda **Dosyalar bölümü**: asistanın ürettiği her dosya saklanır, türüne göre renkli rozetle listelenir ve indirilir
- **Sohbet sabitleme** ve sohbet başlıkları ile mesaj içeriklerinde **tam metin arama**
- Genişliği ayarlanabilir kenar çubuğu, sürüklenip kapatılabilen pencereler, azaltılmış hareket / azaltılmış saydamlık / yüksek kontrast desteği
- Token çubuğu `display` ile açılıp kapandığı için her mesajda tüm sohbeti aşağı zıplatıyordu; artık sayfayı hiç kaydırmayan yüzer bir gösterge

**Yeni**
- **Yönlendirici sorular** — uzun bir işe başlamadan önce asistan en fazla 3 şıklı soru sorar (her birinde serbest metin alanı) ve yalnızca gerçekten belirsiz olanı sorar. Hazır tuşlar bu akışı tek tıkla başlatır; hiçbir şey yazmadan bitmiş bir makaleye ulaşılabilir
- **Nitel analiz** — gömülü kuramda Glaser'ci / Strauss'çu ayrımı, teorik doygunluk ve **NVivo** (`Üst Düğüm / Alt Düğüm`) ya da **MAXQDA** (`Üst Kod / Alt Kod`) biçiminde kod defteri; tanım, dahil–hariç ölçütü ve doğrudan alıntılarla
- **Model ve çaba kontrolü** — Opus 5 / Sonnet 5 / Haiku 4.5 ve düşük→maksimum düşünme çabası, sohbet ortasında değiştirilebilir; süreç `--resume` ile yeniden başladığı için konuşma bağlamı korunur
- **Sunum çıktısı** — herhangi bir asistan mesajı akademik `.pptx` dosyasına çevrilebilir
- **Sürükle-bırak** dosya yükleme
- **Kendini güncelleyen başlatıcı** — açılışta yeni sürümü indirir, kurulum değiştiyse yeniden çalıştırır, bağımlılıkları tazeler

**Değişenler**
- **PDF ayrıştırma MarkItDown'dan [opendataloader-pdf](https://github.com/opendataloader-project/opendataloader-pdf)'e taşındı** — çıkarım doğruluğunda 1. sırada (genelde 0.907'ye karşı 0.589, tablolarda 0.928'e karşı 0.273). Java 11+ gerektirir, kurulum artık bunu da hallediyor. Diğer biçimler hâlâ MarkItDown'dan geçiyor
- Varsayılan model **Sonnet 5**, varsayılan tema **karanlık**
- Hazır tuşlar elden geçirildi: **Planla** ve **Tam Sistem** kaldırıldı, **Nitel Analiz** eklendi. Yetenek kaybı yok — tam süreç ve plan/taslak/revizyon modları serbest metinle istendiğinde hâlâ çalışıyor
- `pptxgenjs`, `exceljs` ve `docx` pakete dahil edildi; asistan Office dosyalarını çalışma anında `npm install` yapmadan üretiyor

**Düzeltmeler**
- **Güvenlik:** sohbet ve oturum adları doğrudan dosya yollarına veriliyordu; özel hazırlanmış bir adla uygulama dışındaki klasörlere ulaşmak — en kötüsü silmek — mümkündü. Kısıtsız CORS bunu kullanıcının ziyaret ettiği herhangi bir siteden erişilebilir kılıyordu. Tüm yollar artık taban klasöre karşı doğrulanıyor, CORS tamamen kaldırıldı (arayüz zaten aynı origin'den servis ediliyor)
- Her yeni sohbet, mesaj gönderilmeden önce **8 saniye** boşuna bekliyordu: backend, Claude'un ancak ilk girdiden *sonra* yayınladığı bir init olayını bekliyordu
- Model değiştirmek, yerine geçen süreci öldürüp oturumu düşürüyordu; sohbet bitmiş gibi görünüyordu
- **Mod seçimi hiçbir işe yaramıyordu** — sistem promptu hazırlanıyor ama Claude'a hiç gönderilmiyordu, dolayısıyla hazır tuşlar dekoratifti
- İlk bağlam aktarımında mevcut mesaj iki kez gönderiliyordu
- **Windows:** `multer` bağımlılık listesinde yoktu, dosya yükleme çöküyordu
- Üretilen dosyalar her açılışta silinen bir klasöre yazılıyordu ve indirmenin bir yolu yoktu
- Sınıf adı çakışması yüzünden model seçicinin oku sürekli yanıp sönüyordu
- Tırnak içeren dosya adları HTML özniteliğinden çıkabiliyordu

### v2.0.1
- **Düzeltme:** Sohbet başlığı üretimi artık Türkçe (ASCII dışı) karakterlerde çökmüyor — prompt artık CLI argümanı yerine stdin üzerinden iletiliyor

### v2.0.0
- **MarkItDown entegrasyonu** — yüklenen dosyalar modele gitmeden önce temiz Markdown'a çevrilir, token kullanımını önemli ölçüde azaltır
- **Skill/araç göstergesi** — üretim sırasında aktif skill ve araç adı üst çubukta canlı gösterilir
- **Limit uyarı şeridi** — kullanım limitine yaklaşıldığında veya limite takıldığında görünür sarı/kırmızı şerit
- **Otomatik oturum yenileme** — her başlatmada `claude auth logout` + `claude auth login` otomatik çalışır
- **Windows kurulum eşitliği** — Python ve MarkItDown artık Windows'ta da otomatik kuruluyor

### v1.1.1
- **Bağlam sürekliliği** — eski bir sohbet açıldığında tüm konuşma geçmişi context olarak enjekte edilir, Claude bağlamı hatırlar
- **Oturum kararlılığı** — uygulama yeniden başlatıldığında çıkan "session already in use" hatası giderildi
- **Sessions temizliği** — eski session klasörleri her başlatmada temizlenir

### v1.1.0
- **Gerçek zamanlı streaming** — token'lar üretildikçe ekranda belirir
- **Canlı token sayacı** — üretim sırasında üst çubukta görünür
- **WebSocket kararlılığı** — heartbeat sistemi, otomatik yeniden bağlanma, kopmada session'a rejoin
- **Yerel bellek** — sohbetler `Chats/` klasörüne kaydedilir, uygulama yeniden açılınca yüklenir
- **Sohbet yönetimi** — yeniden adlandırma, onay penceresiyle silme
- **AI ile sohbet başlığı** — her konuşma için otomatik 3–5 kelimelik başlık
- **WS durum göstergesi** — yeşil / sarı / kırmızı bağlantı durumu
- **PDF iyileştirmeleri** — tüm kullanıcılar için daha geniş Chrome yolu tespiti

### v1.0.0
- İlk sürüm
- Claude Code çok ajanlı pipeline entegrasyonu
- LaTeX formatıyla DOCX & PDF çıktısı
- Türkçe web arayüzü
- macOS & Windows desteği

---

## Teşekkürler

Bu proje, [Cheng-I Wu](https://github.com/Imbad0202) tarafından geliştirilen ve [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) ile lisanslanan **[Academic Research Skills](https://github.com/Imbad0202/academic-research-skills)** üzerine inşa edilmiştir.

Nitel metodoloji **[grad-grounded-theory](https://github.com/asgard-ai-platform/skills)** skill'inden (Apache-2.0), akademik sunum yapısı ise Gabberflast tarafından geliştirilen **[academic-pptx-skill](https://github.com/Gabberflast/academic-pptx-skill)** skill'inden (MIT) gelmektedir.

PDF ayrıştırma **[opendataloader-pdf](https://github.com/opendataloader-project/opendataloader-pdf)** (Apache-2.0), diğer dosya biçimleri ise Microsoft tarafından geliştirilen **[MarkItDown](https://github.com/microsoft/markitdown)** (MIT) ile yapılmaktadır.

---

## Geliştirici

[@sungurulol](https://x.com/sungurulol) tarafından geliştirildi

---

## Lisans

Bu proje [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) ile lisanslanmıştır — atıf vererek, ticari olmayan amaçlarla özgürce kullanılabilir ve paylaşılabilir.
