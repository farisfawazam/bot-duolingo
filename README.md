# DuoBot

Tampermonkey userscript untuk menyelesaikan latihan Duolingo secara otomatis dengan GUI kontrol, Turbo Mode, dan dukungan berbagai tipe soal.

## Fitur Utama

- **Smart Challenge Solver:** Mendukung pilihan ganda, isi kata, translate, match pairs, tap complete, tap cloze, stories, dan mode lainnya.
- **Turbo Mode & Safe Mode:**
  - Turbo Mode (~110–230ms per siklus): Penyelesaian cepat dengan MutationObserver dan proteksi deselect React 18.
  - Safe Mode (~900–2300ms per siklus): Jeda santai mirip interaksi manusia.
- **Run Legendary:** Toggle untuk menyelesaikan atau melewati tantangan Legendary.
- **Auto Next & Auto Start:** Otomatis lanjut ke lesson berikutnya dan otomatis mulai saat membuka halaman Duolingo.
- **Offline Test Suite:** `duobot-test.html` untuk pengujian logic tanpa koneksi ke server Duolingo.

## Struktur Project

```text
bot-duolingo/
├── duolingo-auto-lesson.user.js   # Script Tampermonkey utama (v3.6.9)
├── duobot-test.html               # Offline unit test suite
├── docs/                          # Dokumentasi teknis & arsitektur
│   ├── ARCHITECTURE.md
│   ├── CHALLENGE_TYPES.md
│   ├── CRITICAL_PITFALLS.md
│   ├── FLOW_LIFECYCLE.md
│   └── INDEX.md
└── README.md
```

## Cara Pakai

1. Pasang ekstensi [Tampermonkey](https://www.tampermonkey.net/) di browser.
2. Buat userscript baru, lalu salin isi file `duolingo-auto-lesson.user.js`.
3. Buka situs Duolingo ([https://www.duolingo.com](https://www.duolingo.com)).
4. Gunakan panel overlay di layar untuk mengaktifkan bot (tombol **START**).

## Test Harness

Buka file `duobot-test.html` langsung di browser untuk menjalankan seluruh unit test secara offline.
