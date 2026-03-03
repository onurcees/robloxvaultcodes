# GitHub Pages Kurulum

## 1) Repo'ya push et
- Bu klasörü GitHub'da bir repoya gönder.

## 2) Pages'i aç
- GitHub > Repo > Settings > Pages
- Source: `Deploy from a branch`
- Branch: `main` / `/root`

## 3) URL ayarlarını tek komutla yaz
Komutu proje klasöründe çalıştır:

```bash
node scripts/configure_github_pages.mjs <github-kullanici-adin> <repo-adin>
```

Örnek (project site):

```bash
node scripts/configure_github_pages.mjs octocat roblox-codes
```

Örnek (user site):

```bash
node scripts/configure_github_pages.mjs octocat octocat.github.io --user-site
```

AdSense ve e-posta ile birlikte:

```bash
node scripts/configure_github_pages.mjs octocat roblox-codes --ads-client=ca-pub-1234567890123456 --slot-top=1234567890 --slot-middle=0987654321 --email=admin@example.com
```

## 4) Yayın kontrolü
- `https://.../`
- `https://.../robots.txt`
- `https://.../sitemap.xml`
- `https://.../ads.txt`

## Not
- GitHub Pages'te ilk yayın 1-5 dakika sürebilir.
- Özel domain bağlarsan aynı scripti yeni base URL için tekrar çalıştır.
