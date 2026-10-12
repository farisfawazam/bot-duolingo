# Lifecycle & Flow Eksekusi DuoBot

## Alur Menyeluruh (End-to-End Sequence)

```
[Buka Duolingo]
       │
       ▼
[Phase 1: Fetch Patch Intercept]
       │ (Pasang mock hearts, plus status, cache /sessions)
       ▼
[Phase 2: DOM Boot]
       │ (Render Dark GUI, daftarkan Route Watcher)
       ▼
[User klik ▶ START / Trigger db_autostart]
       │
       ├─── Jika di luar lesson (misal /learn)?
       │      └── jumpToLatestLesson()
       │            ├── Simpan sessionStorage 'db_autostart' = '1'
       │            ├── Cari link/tombol start di level aktif peta
       │            └── Auto navigasi ke /lesson
       │
       └─── Jika sudah di halaman lesson (isOnLesson)?
              └── doStart() -> aktifkan interval tick()
```

**Trigger alternatif (v3.6.6+):**
- **Auto Start mode** (`#db-astart`, persist `localStorage.db_astart_mode`): `checkAutoStart()` juga membaca marker ini — buka Duolingo / reload langsung farming tanpa klik manual.
- **Auto Next** (v3.6.6+): setelah lesson selesai, countdown 5 detik → `nextLesson()` → navigasi `/learn` → `checkAutoStart` lompat ke level aktif → lesson berikutnya auto-start. Farming loop tanpa tangan.

---

## Siklus Loop `tick()`

Dijalankan setiap 1500ms (atau 2200ms di Safe Mode):

```
                       tick()
                         │
                         ▼
              Deteksi end-screen lesson (lessonDone:
               player-practice-again / player-done /
               stories-player-done)
                         │
        ┌────────────────┴────────────────┐
        ▼ Ya (selesai)                    ▼ Tidak
   log 'Lesson selesai'                   Cari tombol Next/Check
   scheduleNext()                         (getNextButton)
   ├── doStop()                                    │
   └── jika Auto Next:              ┌──────────────┴──────────────┐
       startCountdown(5)            ▼ Ada                         ▼ Tidak ada
       → nextLesson()               Apakah tombol                 Return / Idle
       → /learn                     disabled ATAU
       → jumpToLatestLesson         ada story choices?
                                              │
                                 ┌────────────┴────────────────────────────┐
                                 ▼ Ya                                      ▼ Tidak (tombol aktif/ready)
                            getChallenge()                                Klik tombol Next
                            │                                             (Lanjut ke soal berikutnya)
                            ├── 1. Fiber di pills
                            ├── 2. Fiber di containers
                            └── 3. window.__DUO_CHALLENGES__
                            │
                            ├─ Ketemu?
                            │    ├── Cek Run Legendary toggle
                            │    │     └── Jika Legendary & toggle KOSONG
                            │    │           └── scheduleNext() (skip + auto lanjut)
                            │    └── dispatch(challenge)
                            │          ├── Eksekusi solver sesuai type
                            │          └── Tambah counter 'solved' & 'XP'
                            │
                            └─ Tidak ketemu?
                                 └── solveDomFallback()
                                       └── Klik word-bank sisa / story choice /
                                           pill pertama (last resort — jangan
                                           tebak buta di pilihan ganda)
                                   │
                                   ▼
                           Tunggu delay (200ms atau 300-1100ms di Safe Mode)
                                   │
                                   ▼
                   Klik getNextButton() jika sudah enable —
                   MAAR cek lessonDone() dulu (jangan klik
                   tombol replay → loop lesson sama)
```

---

## Cara Deteksi Halaman Lesson (`isOnLesson`)
Halaman dianggap sebagai sesi aktif jika:
1. `location.pathname` mengandung salah satu dari:
   - `/lesson`
   - `/practice`
   - `/stories`
   - `/story`
   - `/alphabets`
   - `/characters`
   - `/legendary`
2. **Atau** elemen DOM player ditemukan di halaman:
   - `[data-test="player-next"]`
   - `[data-test="player-footer"]`
   - `footer button`
   - `[data-test*="challenge"]`

Jika tidak memenuhi salah satu di atas, bot akan mengarahkan browser ke lesson terbaru di peta unit.
