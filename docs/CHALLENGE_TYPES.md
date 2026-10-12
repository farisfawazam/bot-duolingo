# Tipe Soal & Mapping Solver

Duolingo memiliki banyak jenis exercise yang berganti-ganti nama tergantung versi web. Semua dinormalisasi dengan menghapus tanda strip dan huruf besar (`norm(s) = s.toLowerCase().replace(/[-_]/g, '')`).

---

## Tabel Tipe Soal & Fungsi Penangan

| Kategori | Challenge Types | Fungsi Handler | Mekanisme Penyelesaian |
|---|---|---|---|
| **Pilihan Ganda / Pill Choice** | `assist`, `characterIntro`, `characterPuzzle`, `characterSelect`, `definition`, `dialogue`, `dialogueAssist`, `form`, `gapFillSelect`, `imageAssist`, `imageSelect`, `judge`, `listenIsolation`, `select`, `selectPronunciation`, `selectTranscription`, `readComprehension`, `listenComprehension`, `sameDifferent` | `solveChoice` -> `solveChoiceOrToken` | Mencocokkan teks pill dengan `getTargetWords` ATAU mengklik `correctIndex` — **index di-resolve ke kontainer choice terstruktur dulu** (`challenge-choice`, `challenge-choice-card`, `challenge-judge-text`, `[role="radio"]`), bukan union `pills` (v3.6.7). |
| **Isi Kata / Blank / Token** | `completeReverseTranslation`, `partialReverseTranslation`, `typeCloze`, `typeComplete`, `fillInBlank`, `gapFill`, `tapCloze` | `solveFill` | Berlapis (v3.6.7): (A) klik target di pill via `getTargetWords` → (B) fallback pill yang cocok substring `correctSolutions` → (C) isi input sesuai `displayTokens` → (D) contenteditable / input tunggal `correctSolutions` → (E) `solveChoiceOrToken`. Tidak ada tebak pill pertama. |
| **Tap Index / Token Array** | `tapComplete`, `tapCompleteTable` | `solveTapIdx` | Mengklik elemen token `[data-test="challenge-tap-token-text"]` sesuai urutan array `correctIndices`. |
| **Translate / Token Bank** | `translate`, `listenTap`, `tapDescribe` | `solveTranslate` | Mengurutkan token berdasarkan `correctTokens` dan mengklik satu per satu tanpa double-click. Jika input box: isi `correctSolutions[0]`. |
| **Listening / Ketik Audio** | `listen`, `listenTyped`, `typeAnswer` | `solveListen` | Menginjeksi teks transkrip `ch.prompt` langsung ke input box penerjemah. |
| **Pencocokan Pasangan (Pairs)** | `match`, `characterMatch`, `listenMatch` | `solveMatch` | Mencari pasangan token dari `pairs` (`fromToken` vs `learningToken`), klik kedua sisi. |
| **Nama / Artikel Kata Benda** | `name` | `solveName` | Memilih artikel (`el/la/le/das` dsb) di pill, lalu mengetik sisa kata benda ke text input. |
| **Stories (Cerita Interaktif)** | `multipleChoice`, `pointToPhrase`, `arrange`, atau elemen `data-test="stories-choice"` | `solveStory` | Mengklik pilihan cerita pada index `correctAnswerIndex` / `correctIndex`. |
| **Speech / Bicara** | `speak`, `readAloud`, `freeResponse`, `listenSpeak`, `characterTrace`, `characterWrite` | `skipSpeech` | Mengklik tombol "Can't speak now" / `[data-test="player-skip"]`. |

---

## Logika Pemilihan Target Word (`getTargetWords`)
Fungsi `getTargetWords(ch, pills)` mengekstrak kata yang harus diklik secara berurutan:
1. `ch.correctTokens`: Array token — string ATAU object (`x.text||x.token||x.word`), di-normalisasi (v3.6.7, `String(object)` = `"[object Object]"` bug).
2. `ch.displayTokens`: Mencari token yang bertanda `isBlank: true` atau memiliki `damageStart`.
3. `ch.correctIndices`: Memetakan index ke array `ch.choices` atau `ch.tokens`, ekstraksi string dari `{text|phrase|word|translation|value|display}`.
4. `ch.correctIndex`: Single choice target.
5. `ch.correctSolutions[0]`: Memetakan kata-kata yang cocok dengan pill dan mengurutkannya berdasarkan kemunculan awal di kalimat solusi.

> **Catatan fallback (v3.6.7):** Jika target tidak ketemu, `solveChoiceOrToken`:
> - Index `idx` → query kontainer choice terstruktur dulu, `pills` cadangan.
> - Word-bank auto-click hanya bila jumlah pill == jumlah blank (`blankCnt` dari `displayTokens`).
> - `pills[0]` hanya bila **tidak ada** choice terstruktur di halaman — jangan tebak buta di pilihan ganda.
