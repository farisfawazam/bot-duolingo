# Arsitektur DuoBot

## 1. Pembagian Fase Eksekusi
Script berjalan dalam 2 fase terpisah menggunakan IIFE (Immediately Invoked Function Expression):

### Fase 1: Fetch Patch (Run-at: `document-start`)
- Berjalan **sebelum** Duolingo JS di-load oleh browser.
- Meng-intercept `window.fetch`:
  1. **Block Remove Heart:** Jika request `POST` mengandung `remove-heart`, return response dummy `{}` status 200. Hearts tidak pernah berkurang.
  2. **Spoof Super/Plus Subscription:** Jika request `GET` ke endpoint `/users/`, respons diubah via JSON cloning: `unlimitedHeartsAvailable = true`, `hasPlus = true`, `premium_subscription.status = ACTIVE`.
  3. **Cache Soal Jaringan:** Jika request mengandung `/sessions`, `/legendary`, `/practice`, atau `/challenge`, ekstrak array `challenges` ke variabel global `window.__DUO_CHALLENGES__`. Ini ground truth jawaban jika React Fiber terkunci.

### Fase 2: Main Application (Run-at: `DOMContentLoaded` atau inline)
- Berjalan setelah DOM siap.
- Menginisialisasi GUI overlay, event listener, mutation observer, dan core solver loop.

---

## 2. Struktur Data Kunci
```
window
 └── __DUO_CHALLENGES__ : Array<ChallengeObject> (diisi oleh Phase 1)
      ├── type: "gapFill" | "translate" | "tapCloze" | ...
      ├── prompt / sentence
      ├── choices / tokens
      ├── correctIndex / correctIndices
      ├── correctTokens / displayTokens
      └── correctSolutions
```

---

## 3. Komponen Inti Phase 2

### A. Element Clicker (`clickEl`)
- Duolingo menggunakan React 18 synthetic event bubbling.
- **Aturan penting:** Gunakan `target.click()` murni satu kali.
- **Peringatan:** Jangan mendispatch kombinasi `pointerdown` + `mousedown` + `click` sintetis sekaligus, karena pada beberapa versi React ini memicu double-toggle (elemen terklik lalu seketika batal dipilih).

### B. Input Dispatcher (`dynamicInput`)
- React meng-override prototype setter `value` pada input field.
- `dynamicInput` men-set nilai, memanggil `el._valueTracker.setValue(prev)` jika ada, lalu mendispatch `Event('input', { bubbles: true })`.

### C. Fiber Extractor (`findFromFiber`)
- Membaca properti `__reactFiber$...` dari elemen DOM.
- Melakukan pendakian hirarki Fiber (hingga 50 level ke atas):
  - Memeriksa `memoizedProps` untuk properti `challenge`, `currentChallenge`, `activeChallenge`, `item.challenge`, `slide.challenge`.
  - Memeriksa semua key `memoizedProps` yang memiliki struktur soal (`correctIndex`, `choices`, dll).
  - Memeriksa linked list `memoizedState` (hooks state).
  - Memeriksa `stateNode.props` dan `stateNode.state`.

### D. Session Fallback Matcher
- Jika Fiber tidak mengembalikan soal, cari di `window.__DUO_CHALLENGES__`.
- Menggunakan:
  1. **Solusi Penuh:** `correctSolutions[0]` di-normalisasi via `normText()` (kolaps `…/_/.` + spasi beruntun) dan dicocokkan substring ke `bodyNorm`.
  2. **Trigram Matching:** Memecah `correctSolutions` menjadi frasa 3-kata berturutan dan memeriksa apakah ada yang muncul di `document.body` (efektif untuk soal ber-blank).
  3. **Token Join & Prompt/Sentence matching:** gabungan `tokens`/`displayTokens`, `prompt`, `sentence` vs `bodyNorm`.
- Fallback DOM (`solveDomFallback`) klik word-bank sisa / story choice — tidak tebak buta di pilihan ganda.

### E. GUI Overlay (Dark Theme)
- Di-mount ke `#db-root` dengan CSS terisolasi (z-index 99999999).
- Komponen:
  - Header & Brand (dot status LED: hijau running, merah stopped).
  - Stats card: XP (dihitung `solved * 15`), Solved counter, Timer.
  - Action button: Start / Stop.
  - Toggles: Safe Mode (random delay 300-1100ms), Run Legendary (di-check = jalankan legendary, kosong = skip), Auto Next (countdown 5 detik lanjut lesson berikutnya), Auto Start (mode farming, persist localStorage), Unlimited Hearts status.
  - Countdown bar (`#db-cd`): tampil selama Auto Next menunggu.
  - Log console (max 30 baris).
  - Minimize FAB (Floating Action Button).
