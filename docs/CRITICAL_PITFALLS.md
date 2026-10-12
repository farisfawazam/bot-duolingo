# Critical Pitfalls & Troubleshooting

Catatan penting dari kasus-kasus bug nyata yang pernah diselesaikan pada project ini. **JANGAN UBAH** bagian-bagian kode berikut tanpa memahami alasan di bawah ini:

---

## 1. Angka Shortcut pada Teks Pill (`cleanPillText`)
### Masalah:
Duolingo me-render nomor shortcut keyboard langsung di dalam elemen tombol/pill.
Contoh: Tombol menampilkan `1\nbooks` atau `2\nsit`.
Jika dicek langsung: `'1\nbooks' === 'books'` -> `false`! Bot gagal mengenali opsi jawaban.

### Solusi Wajib:
Selalu lewatkan teks tombol ke `cleanPillText()`:
```javascript
function cleanPillText(raw){
  return (raw||'').replace(/^\s*\d+[\s\n\r]+/, '').replace(/[\s\n\r]+\d+\s*$/, '').trim().toLowerCase();
}
```

---

## 2. Double-Click Deselection di React 18 (`clickEl`)
### Masalah:
Jika fungsi klik mengirimkan kombinasi `pointerdown`, `mousedown`, `pointerup`, `mouseup`, dan `click` sintetis sekaligus, React 18 event delegation menerima dua kali event klik.
Akibatnya: Tombol pilihan terklik (terpilih), lalu seketika batal dipilih (deselected). Tombol "CHECK" tetap disabled dan bot macet.

### Solusi Wajib:
Gunakan native `.click()` tunggal:
```javascript
function clickEl(el){
  if(!el)return false;
  const target=el.closest(...) || el;
  try{
    if(typeof target.click==='function')target.click();
    else target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
  }catch(_){...}
  return true;
}
```

---

## 3. Substring Matching Rontok pada Soal Ber-Blank (Trigram Matcher)
### Masalah:
Saat soal tipe `gapFill` muncul di layar, kalimat di web memiliki bagian kosong:
- Web: `"I like to in the front row because I can talk to the teacher."` (kata 'sit' tidak ada di teks layar karena masih kosong).
- Solusi di cache: `"I like to sit in the front row because I can talk to the teacher."`
Jika bot mencocokkan string `solusi.slice(0, 15)` (`"i like to sit i"`), pencarian gagal karena `"sit"` belum ada di layar!

### Solusi Wajib:
Gunakan algoritma **Trigram (3 kata berturutan)**:
Memecah solusi menjadi token 3-kata (`["i like to", "like to sit", "in the front", "the front row", ...]`).
Cukup salah satu trigram cocok dengan teks halaman untuk memastikan kecocokan soal. Ditambah cek minimal 2 pilihan jawaban cocok.

---

## 4. Perbedaan Route Lesson Legendary (`/legendary`)
### Masalah:
Lesson biasa memakai path `/lesson`, tetapi Legendary lesson di Unit Path Duolingo sering menggunakan route `/legendary` atau membuka modal khusus.
Jika route check hanya memeriksa `/lesson` atau `/practice`:
Bot mengira berada di menu utama dan memicu `jumpToLatestLesson()`, mengakibatkan infinite reload atau terhenti.

### Solusi Wajib:
Sertakan `/legendary` di daftar route dan periksa keberadaan elemen challenge DOM sebagai fallback utama.

---

## 5. Multi-Blank Token Deselection (`Set` Tracking)
### Masalah:
Pada soal seperti `tapCloze` (Fill in the blanks dengan beberapa kata kosong berurutan), jika ada kata yang sama atau loop mengiterasi tombol yang sudah diklik, mengklik tombol yang sama akan membatalkan pilihan.

### Solusi Wajib:
Simpan elemen yang sudah diklik di dalam `clickedPills = new Set()` agar elemen yang sama tidak diklik dua kali dalam satu giliran soal.

---

## 6. Dead Code yang Sudah Dieliminasi (v3.6.1)
- Redundant index lookup di `solveChoice` setelah `solveChoiceOrToken`.
- Duplikat tipe soal di `FILL` (`partialReverseTranslate` vs `partialReverseTranslation`).
- `tapComplete` dan `tapCompleteTable` yang sebelumnya tertutup oleh `FILL.includes(t)` sebelum sampai ke `solveTapIdx`.
- Elemen GUI `db-xp` yang sebelumnya tidak terikat data, sekarang terikat ke `solved * 15`.

---

## 7. Skip Legendary Gagal Karena Type Tidak `'legendary'` (v3.6.2)
### Masalah:
Challenge object dari cache `/legendary` tidak pernah ber-type `'legendary'`; property `metadata.isLegendary` juga sering absen. Cek `elLeg.checked && ch.type==='legendary'` tidak pernah terpenuhi — toggle **Skip Legendary** nyaris tidak berfungsi.

### Solusi Wajib:
Pakai helper `isLegendarySession(ch)` yang mengecek **type, metadata, DAN route `/legendary`**:
```javascript
function isLegendarySession(ch,path=location.pathname){
  return !!ch&&(ch.type==='legendary'||ch.metadata?.isLegendary||path.includes('/legendary'));
}
```
Gunakan di `tick()` sebagai pengganti cek `ch.type` saja.

---

## 8. `solveListen` Hanya Membaca `challenge-translate-input` (v3.6.2)
### Masalah:
Tipe `listenTyped`/`typeAnswer` memakai input `[data-test="challenge-text-input"]`, bukan `challenge-translate-input`. Jawaban juga bisa ada di `correctSolutions`, bukan hanya `ch.prompt`.

### Solusi Wajib:
Pada `solveListen`, fallback ke `challenge-text-input` dan gunakan `ch.prompt || ch.correctSolutions[0]`.

---

## 9. `tapComplete` Kedetect Tapi Tidak Ke-Tap (v3.6.3)
### Masalah:
`solveTapIdx` lama punya guard `if(!ch.correctIndices)return;` — saat `correctIndices` kosong/`undefined` di cache soal, solver diam tanpa klik apa pun. `tick()` tetap menambah `solved` dan log `✓ tapComplete` (log palsu — tidak ada yang benar-benar diklik). Indeks `toks[i]` juga bisa melebihi jumlah token di DOM.

### Solusi Wajib:
1. `solveTapIdx` harus return `false` saat tidak ada yang diklik, dan fallback ke `getTargetWords`:
   - Jika `correctIndices` ada → klik per indeks.
   - Jika kosong → resolve target (`correctTokens` → `displayTokens` blank → cocokkan `correctSolutions`) lalu klik token per teks.
2. `tick()` hanya menambah `solved` & log `✓` jika `dispatch(ch) !== false`; selain itu log `⚠ tidak bisa eksekusi <type>`.

---

## 10. Fill-in-the-Blank / tapCloze Tidak Kedetect & Tidak Ke-Tap (v3.6.4)
### Masalah (dikonfirmasi dari solver pihak ketiga DuoPower 2023 & Auto Solver 2024):
1. **Matcher cache gagal:** `correctSolutions` di-trigram terhadap `document.body.innerText` mentah. Blank soal dirender sebagai `___`/`…` di DOM, jadi solusi penuh ("I ___ up early today") tidak pernah cocok secara substring; trigram 3-kata juga patah di tengah kalimat ber-blank. Akibat: soal dianggap tidak ada → fallback gamling.
2. **`solveTapIdx` salah scope:** semua solver pihak ketiga memakai `document.querySelectorAll('div[data-test="word-bank"] [data-test="challenge-tap-token-text"]')[index]` — `correctIndices` mengindeks token DI WORD-BANK. Script lama mengquery semua token (termasuk token kalimat) → indeks bergeser/out-of-bounds → tidak ke-tap.

### Solusi Wajib:
1. Tambah helper `normText(s)`: kolaps `…/_/./*` dan spasi beruntun jadi satu spasi + lowercase. Matcher pakai `bodyNorm` dan `inBody()` untuk: solusi penuh, trigram, gabungan `tokens`/`displayTokens`, `prompt`, `sentence`.
   - Catatan: token join (`displayTokens`) memakai `String(t||'')` dan `t.text`, abaikan token tanpa teks untuk sentence matching.
2. `solveTapIdx`: query token word-bank **dulu**, fallback ke semua token hanya jika word-bank kosong.
3. Saat `getChallenge()` kosong, log `⚠ soal tidak terdeteksi — fallback DOM` agar deteksi kegagalan terlihat.
4. Gate fiber `getChallenge` tambah `correctIndices`/`tokens` (tapCloze kadang hanya punya ini, tanpa `correctSolutions`).

---

## 11. Story Arrange Kedetect Tapi Tidak Di-Arrangge (v3.6.5)
### Masalah:
`solveStory` lama hanya menangani multiple-choice: klik `[data-test="stories-choice"]`/`challenge-choice` by `correctIndex`/`correctAnswerIndex`, lalu `pairs`. Tipe `arrange` (form-the-sentence / susun kalimat) memakai `correctTokens` berurut di atas chip `stories-choice` — tidak ada cabang → tidak ada yang diklik ("gak nge arrange walau ke detect").

### Solusi Wajib:
1. `solveStory` berlapis (return boolean):
   - (1) `correctTokens` → klik chip `stories-choice` berurutan cocok teks (via `cleanPillText`, urut, tanpa double-click).
   - (2) `correctIndices` → klik chip by indeks.
   - (3) choice tunggal by `correctIndex`/`correctAnswerIndex`.
   - (4) token tile (layout lesson di story) → `solveTapIdx`.
   - (5) `pairs` → `solveMatch`.
2. `dispatch`: jika `[data-test="stories-choice"]` ada di halaman → semua tipe story (multiplechoice/pointtophrase/arrange/tapComplete) dibawa ke `solveStory` lebih dulu, sebelum routing tipe biasa.
3. `deepFind` sudah mendukung `storyChallenge` (cek paritas tetap ada).

---

## 12. Auto Next & Run Legendary (v3.6.6)
### Masalah audit:
1. Toggle Legendary lama (Skip Legendary) tak bisa "jalankan legendary"; hanya skip-or-tidak.
2. Setelah lesson selesai bot berhenti di end-screen; `getNextButton` bahkan mengklik `player-practice-again` (replay) → bisa loop lesson sama selamanya, tak pernah lanjut ke lesson berikutnya.

### Solusi Wajib:
1. Toggle **Run Legendary** (check = jalankan, kosong = skip). Gate di `tick`: `if(!elLeg.checked&&isLegendarySession(ch)){log(...);scheduleNext();return;}`.
2. **Auto Next**: deteksi selesai via `lessonDone()`:
   - Selector: `[data-test="player-practice-again"], [data-test="player-done"], [data-test="stories-player-done"]`.
   - `scheduleNext()`: `doStop()` → jika `elAuto.checked` → `startCountdown(5)` → `nextLesson()` (`sessionStorage db_autostart='1'` + `location.href='/learn'`).
   - Di `/learn`, `checkAutoStart()` melompat ke level aktif via `jumpToLatestLesson()` → lesson berikutnya terbuka & auto-start.
3. **Anti-replay loop:** klik Check/Continue yang ditunda (`setTimeout` di `tick`) harus cek `lessonDone()` dulu — jika end-screen sudah muncul, jangan klik replay; arahkan ke `scheduleNext()`.
4. **Auto Start** (mode farming): toggle `#db-astart` persist `localStorage.db_astart_mode`; `checkAutoStart()` juga membaca marker ini — page reload / kembali ke `/learn` langsung lanjut farming tanpa klik manual.
5. **Persistensi toggle:** Safe Mode, Run Legendary, Auto Next, Auto Start disimpan di `localStorage` via `bindToggle` (key `db_safe/db_leg/db_auto/db_astart_mode`).
6. **Manual tombol Start/Stop** batalkan countdown (`elBtn.onclick=()=>{stopCountdown();running?doStop():doStart();}`).

---

## 13. Choice Indeks Bergeser & Tebak Buta Pill Pertama (v3.6.7)
### Masalah:
1. **Indeks bergeser:** `correctIndex` diterapkan ke `pills` hasil `getPills()` — union selector (termasuk `[data-test*="tap-token"]`). Soal choice bisa punya elemen ber-`tap-token` (mis. prompt) di depan → `pills[1]` ≠ opsi ke-2 → bot mengklik opsi salah (contoh: menjawab "will" padahal bukan jawaban).
2. **Tebak buta:** fallback terakhir `pills[0]` selalu mengklik pill pertama saat data soal tak ketemu → pada fill-in-the-blank bot konsisten mengklik pill pertama ("will") dan selalu salah.
3. **Target tak lengkap:** `ch.choices[i]` / `correctTokens[i]` bisa ber-object (`{text|word|translation|value|display}`) dan `String(x)` menghasilkan `"[object Object]"` → match gagal → fallback buta.

### Solusi Wajib:
1. `solveChoiceOrToken` Fallback 1: untuk `idx`, query **kontainer choice terstruktur** dulu (`challenge-choice`, `challenge-choice-card`, `challenge-judge-text`, `[role="radio"]`), baru `pills` sebagai cadangan.
2. `pills[0]` hanya dipakai bila **tidak ada** choice terstruktur di halaman (`structured.length===0`) — jangan menebak di pilihan ganda.
3. Word-bank auto-click hanya bila `blankCnt===0` atau jumlah pill == jumlah blank (`blankCnt` dari `displayTokens`), bukan asal ≤3.
4. Ekstraksi objek: `correctTokens`/`choices`/`tokens` di-normalisasi lewat `x.text||x.token||x.word||x.translation||x.value||x.display`.
5. `solveFill` dirombak berlapis: (A) klik target di pill via `getTargetWords` → (B) fallback pill yang cocok substring `correctSolutions` → (C) isi input `displayTokens` → (D) contenteditable/input tunggal `correctSolutions` → (E) `solveChoiceOrToken`. Tidak ada lagi tebak pill pertama.

---

## 14. Partial Fiber Vexing the Blind Pills[0] (v3.6.9)
### Masalah:
GapFill choice-card — 3 option pill "1 a lot of money" / "2 a great job" / "3 a birthday cake" — bot menjawab "a lot of money" (opsi 1) padahal benar "a great job" (opsi 2). Chains:
1. `getChallenge()` fiber traversal (`findFromFiber`) menemahan object challenge yang **partial**: `{type:'gapFill', choices:[...]}` — tanpa `correctIndex`/`correctSolutions`. Karena old code `return chF` di step 1/2 JANGAN cek field jawaban, partial ini mendahulukan cache `/sessions` (step 3) yang punya `correctIndex:1`.
2. Partial → `getTargetWords` kosong → `solveChoiceOrToken` fallback → `idx` undefined → **blind `pills[0]`** → opsi 1 `"a lot of money"`.

### Solusi Wajib:
1. `hasAnswer(ch)` gate: fiber object hanya trusted bila punya `correctIndex!==undefined` ATAU `correctIndices|correctTokens|correctSolutions|pairs` (field jawaban nyata). Object yang hanya `{type,choices}` → di-keep di `partial` variabel, bukan return.
2. Ordering: fiber full-answer > `matchFromCache()` (trigram/choices matcher, ground truth) > partial fiber last resort. Cache dibaca BEFORE partial.
3. Fallback 3 guard: `pills[0]` niemals klik bila `ch.choices` ada (multi-choice soal) — blind klik = opsi 1 SAMA selalu. Skip + log ⚠ lebih baik dari jawab salah.
4. Turbo guard 2.0: `lastRes===true` (jadi klik) tidak blokir retry selamanya — kalau >6s CHECK masih disabled (jawaban tak kompleet/multi-blank), retry dieksekusi setelah `retryAt+6000`.
