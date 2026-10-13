# Tempa

Aplikasi PWA pribadi untuk melacak berat badan, kalori, dan uang makan, lengkap dengan coach AI yang tegas.

## Fitur

- Catat makan dengan teks bebas atau foto. AI menghitung kalori, makro, dan harga, lalu kamu cek sebelum disimpan.
- Ring kalori harian, makro, air minum, olahraga (MET atau langkah), dan budget makan.
- Grafik BB dengan garis rencana dan proyeksi tanggal sampai target.
- Coach AI yang membaca data harianmu.
- XP, level, streak disiplin, 21 badge, milestone BB.
- Bisa offline. Data tersimpan di HP (IndexedDB), dengan export/import JSON.

## Deploy ke GitHub Pages (tanpa install apa pun)

1. Buka github.com, tekan **New repository**. Nama: `tempa`, pilih **Public**, tekan **Create repository**.
2. Di halaman repo, tekan **uploading an existing file**. Seret semua isi folder ini (`index.html`, `manifest.webmanifest`, `sw.js`, folder `css`, `js`, `icons`). Tekan **Commit changes**.
3. Buka **Settings → Pages**. Di *Branch* pilih `main` dan folder `/ (root)`, tekan **Save**.
4. Tunggu 1 sampai 2 menit. Aplikasi ada di `https://USERNAME.github.io/tempa/`.

## Pasang di HP

1. Buka alamat di atas pakai Chrome di HP.
2. Menu titik tiga → **Tambahkan ke layar utama** / **Install aplikasi**.
3. Buka dari ikon Tempa, isi profil, lalu masukkan API key di bagian AI.

## API key gratis

- Groq: https://console.groq.com/keys
- Gemini: https://aistudio.google.com/apikey

Key hanya disimpan di HP dan tidak ikut ke file backup. Jangan taruh key di kode atau repo.

## Update aplikasi

Upload ulang file yang berubah, lalu naikkan `VERSION` di `sw.js` (misalnya `tempa-v2`). HP akan memakai versi baru setelah aplikasi dibuka dua kali.

## Backup

Pengaturan → **Export backup** secara rutin, simpan file JSON-nya di Google Drive. Data hilang kalau data Chrome dihapus atau HP direset.
