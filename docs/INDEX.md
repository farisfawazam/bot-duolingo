# DuoBot Knowledge Base

> **Petunjuk untuk AI Model Baru:**
> Baca file-file dalam folder ini secara berurutan sebelum mengedit kode:
> 1. `ARCHITECTURE.md` - Struktur 2-fase script, fetch intercept, React Fiber, GUI.
> 2. `FLOW_LIFECYCLE.md` - Alur eksekusi dari `/learn` sampai selesai lesson.
> 3. `CHALLENGE_TYPES.md` - Daftar tipe soal Duolingo dan solver mapping.
> 4. `CRITICAL_PITFALLS.md` - Masalah krusial & jebakan umum (React 18, token shortcut, Legendary).

---

## File Utama Project
- **Userscript:** `C:\Users\User\AppData\Local\Temp\antigravity\duolingo-auto-lesson.user.js`
  - Script Tampermonkey tunggal (v3.6.9).
  - Target URL: `https://*.duolingo.com/*`, `https://*.duolingo.cn/*`.
- **Test Harness:** `C:\Users\User\AppData\Local\Temp\antigravity\duobot-test.html`
  - Test suite offline (48+ unit tests) tanpa network Duolingo.
- **Dokumentasi:** `C:\Users\User\duobot-docs\` (folder ini).

---

## Ringkasan Fungsi Utama
| Modul | Lokasi File | Tanggung Jawab |
|---|---|---|
| Phase 1: Fetch Patch | Baris 15–47 | Mock Super status, cegah remove heart, cache `/sessions` & `/legendary` |
| Fiber Traversal | Baris 57–316 | Ekstraksi challenge object dari React 18 DOM tree + matcher session fallback (`normText`/`inBody`) |
| Challenge Solvers | Baris 317–590 | Klik pill/choice (index scoped ke kontainer choice), ketik teks, pasang pair, tapIdx, cerita |
| Core Loop (`tick`) | Baris 620–671 | Polling per interval, deteksi next button, `lessonDone` gate, submit jawaban |
| Auto Navigator | Baris 672–704 | Auto lompat ke node aktif dari peta course `/learn` (via `jumpToLatestLesson`) |
| Start/Stop & Timer | Baris 705–740 | `doStart`/`doStop`, update timer |
| Auto Next (countdown) | Baris 741–772 | `lessonDone` → countdown 5 detik → `nextLesson()` (farming loop) |
| GUI Controller | Baris 773–1000 | Dark HUD, toggle Safe Mode / Run Legendary / Auto Next / Auto Start, countdown bar, log realtime |
| Route Watcher | Baris 982–1010 | `checkAutoStart` + MutationObserver, trigger autostart/auto-jump |
