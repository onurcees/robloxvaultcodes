# SEO + AdSense Kurulum Notları

## 0. GitHub Pages ise (önerilen hızlı yol)
Aşağıdaki scripti çalıştır:

`node scripts/configure_github_pages.mjs <github-kullanici-adin> <repo-adin>`

Bu komut `site-config.js`, `robots.txt` ve `sitemap.xml` dosyalarını otomatik günceller.

## 1. Domain değişkenlerini güncelle
Aşağıdaki dosyalardaki `https://your-domain.com` değerlerini kendi domaininle değiştir:
- `index.html` (`canonical`, `og:url`, `og:image`, `hreflang`)
- `about.html`, `privacy.html`, `terms.html`, `contact.html` (`canonical`)
- `robots.txt` (`Sitemap`)
- `sitemap.xml` (`loc`)

## 2. site-config.js ayarı
`site-config.js` içinde aşağıyı doldur:
- `siteUrl`: `https://senin-domainin.com`
- `adsenseClient`: `ca-pub-XXXXXXXXXXXXXXXX`
- `adsenseSlots.top`: 10 haneli ad slot ID
- `adsenseSlots.middle`: 10 haneli ad slot ID

## 3. ads.txt ayarı
`ads.txt` içindeki satırı gerçek pub ID ile güncelle:
- `google.com, pub-XXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`

## 4. Search Console
- Siteyi Search Console'a ekle
- `sitemap.xml` gönder
- Tarama hatalarını kontrol et

## 5. AdSense
- Siteyi AdSense'e ekle
- Domain doğrulaması tamamlanınca slot ID'lerini panelden al
- Çerez banner onayı ile reklamların yüklendiğini test et

## 6. Yayın sonrası kontrol
- `https://senin-domainin.com/robots.txt`
- `https://senin-domainin.com/sitemap.xml`
- `https://senin-domainin.com/ads.txt`
- Ana sayfada canonical, OG ve Twitter meta etiketleri
