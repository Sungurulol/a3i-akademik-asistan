"""PDF onarımı: opendataloader-pdf'in reddettiği PDF'leri yeniden yazar.

opendataloader-pdf (veraPDF tabanlı) standarda sıkı sıkıya uyar; tek bir
kuralsız nesne yüzünden bütün dosyayı reddedebilir. Sık görülen örnek,
yayıncı araçlarının künye (Info) sözlüğüne boşluklu anahtar yazması:

    <</Universal PDF(...) /codeMantra, LLC(...) ...>>

pikepdf (qpdf) hoşgörülü okur ve dosyayı standarda uygun biçimde yeniden
yazar: iç dizin (xref) baştan oluşturulur, künye sözlüğü atılır. Metin
çıkarmada künyenin hiçbir rolü yoktur.

Kullanım: python pdf_onar.py <kaynak.pdf> <hedef.pdf>
Başarılıysa 0, değilse 1 ile çıkar.
"""
import sys


def main() -> int:
    if len(sys.argv) != 3:
        print("kullanim: pdf_onar.py <kaynak.pdf> <hedef.pdf>", file=sys.stderr)
        return 1
    src, dst = sys.argv[1], sys.argv[2]
    try:
        import pikepdf
    except ImportError:
        print("pikepdf kurulu degil", file=sys.stderr)
        return 1
    try:
        with pikepdf.open(src) as pdf:
            if "/Info" in pdf.trailer:
                del pdf.trailer["/Info"]
            pdf.save(dst)
    except Exception as e:  # parola korumalı ya da onarılamayacak kadar bozuk
        print(f"onarilamadi: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
