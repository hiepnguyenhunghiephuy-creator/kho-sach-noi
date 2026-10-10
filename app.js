/* Kho Sách Nói — app logic. Mọi dữ liệu sách đều fetch từ data/books.json */
'use strict';

const LS_KEY = 'kho-sach-noi-progress-v1';
const MARKS_KEY = 'kho-sach-noi-marks-v1';
const CATEGORIES = ['Tất cả', '🌟 Rồng & Nếp', 'Động lực', 'Kinh doanh', 'Kỹ năng', 'Tiếng Anh'];
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

const state = {
  books: [],
  filter: 'Tất cả',
  query: '',
  book: null,          // book object đang phát
  chapterIdx: 0,
  speedIdx: 1,
  timerId: null,
  timerEnd: 0,
  saveTick: 0,
  readalong: false,    // chế độ vừa nghe vừa đọc
  sentences: [],       // [{text, start, end}]
  activeSent: -1,
  marks: [],           // đoạn hay đã đánh dấu
};

function loadMarks() {
  try { state.marks = JSON.parse(localStorage.getItem(MARKS_KEY)) || []; }
  catch { state.marks = []; }
}
function saveMarks() {
  try { localStorage.setItem(MARKS_KEY, JSON.stringify(state.marks)); } catch {}
}
loadMarks();

const $ = (id) => document.getElementById(id);
const audio = new Audio();
audio.preload = 'metadata';

const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return m + ':' + String(sec).padStart(2, '0');
};
const fmtDur = (s) => {
  const m = Math.round(s / 60);
  return m <= 0 ? '1 phút' : m + ' phút';
};
const bookBySlug = (slug) => state.books.find((b) => b.slug === slug);
const curChapter = () => state.book && state.book.chapters[state.chapterIdx];

/* ---------- dữ liệu ---------- */
async function loadBooks() {
  const res = await fetch('data/books.json');
  if (!res.ok) throw new Error('Không tải được data/books.json');
  const data = await res.json();
  state.books = data.books || [];
  renderChips();
  renderGrid();
  renderStats();
  refreshResumeBtn();
}

function renderStats() {
  const chapters = state.books.reduce((n, b) => n + b.chapters.length, 0);
  const secs = state.books.reduce((n, b) => n + b.chapters.reduce((s, c) => s + (c.duration_secs || 0), 0), 0);
  $('stat-books').textContent = state.books.length;
  $('stat-chapters').textContent = chapters;
  $('stat-minutes').textContent = Math.round(secs / 60);
}

function renderChips() {
  $('chips').innerHTML = CATEGORIES.map((c) =>
    `<button class="chip${c === state.filter ? ' active' : ''}" data-cat="${c}" role="tab">${c}</button>`
  ).join('');
  $('chips').querySelectorAll('.chip').forEach((el) =>
    el.addEventListener('click', () => { state.filter = el.dataset.cat; renderChips(); renderGrid(); })
  );
  $('kids-banner').hidden = state.filter !== '🌟 Rồng & Nếp';
}

function filteredBooks() {
  const q = state.query.trim().toLowerCase();
  return state.books.filter((b) => {
    const okCat = state.filter === 'Tất cả' || b.category === state.filter;
    const okQ = !q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q);
    return okCat && okQ;
  });
}

function renderGrid() {
  const books = filteredBooks();
  $('empty').hidden = books.length > 0;
  $('grid').innerHTML = books.map((b) => {
    const total = b.chapters.reduce((s, c) => s + (c.duration_secs || 0), 0);
    return `
    <article class="card" data-slug="${b.slug}" tabindex="0" role="button" aria-label="${b.title}">
      <div class="card-cover">
        <img src="${b.cover}" alt="Bìa sách ${b.title}" loading="lazy">
        <button class="card-play" data-play="${b.slug}" aria-label="Nghe ${b.title}">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
      </div>
      <div class="card-body">
        <h3 class="card-title">${b.title}</h3>
        <p class="card-author">${b.author}</p>
        <p class="card-meta"><span class="cat-dot"></span>${b.category} · ${b.chapters.length} chương · ${fmtDur(total)}</p>
      </div>
    </article>`;
  }).join('');

  $('grid').querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-play]')) return;
      openDetail(card.dataset.slug);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.target.closest('[data-play]')) openDetail(card.dataset.slug);
    });
  });
  $('grid').querySelectorAll('[data-play]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = bookBySlug(btn.dataset.play);
      if (b) playChapter(b, 0);
    })
  );
}

/* ---------- chi tiết sách ---------- */
function openDetail(slug) {
  const b = bookBySlug(slug);
  if (!b) return;
  const total = b.chapters.reduce((s, c) => s + (c.duration_secs || 0), 0);
  $('d-cover').src = b.cover;
  $('d-cover').alt = 'Bìa sách ' + b.title;
  $('d-cat').textContent = b.category;
  $('d-title').textContent = b.title;
  $('d-author').textContent = b.author;
  $('d-meta').textContent = `${b.chapters.length} chương · tổng ${fmtDur(total)}`;
  $('d-desc').textContent = b.description || '';
  $('d-credit').textContent = `Tóm tắt & diễn giải: Boss • Nguồn cảm hứng: ${b.source || b.title + ' – ' + b.author}`;
  $('chapter-list').innerHTML = b.chapters.map((c, i) => `
    <li class="chapter${isPlaying(b.slug, i) ? ' playing' : ''}" data-idx="${i}" tabindex="0" role="button" aria-label="Nghe ${c.title}">
      <span class="ch-num">${c.n}</span>
      <span class="ch-title">${c.title}</span>
      <span class="ch-dur">${fmt(c.duration_secs || 0)}</span>
      <button class="ch-play" aria-label="Phát chương ${c.n}">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </button>
    </li>`).join('');
  $('chapter-list').querySelectorAll('.chapter').forEach((li) => {
    const go = () => playChapter(b, Number(li.dataset.idx));
    li.addEventListener('click', go);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
  $('d-play').onclick = () => playChapter(b, 0);
  $('view-home').hidden = true;
  $('view-marks').hidden = true;
  $('view-detail').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goHome() {
  $('view-detail').hidden = true;
  $('view-marks').hidden = true;
  $('view-home').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goMarks() {
  renderMarks();
  $('view-home').hidden = true;
  $('view-detail').hidden = true;
  $('view-marks').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- trình phát ---------- */
function isPlaying(slug, idx) {
  return !audio.paused && state.book && state.book.slug === slug && state.chapterIdx === idx;
}

function playChapter(book, idx, startAt = 0) {
  state.book = book;
  state.chapterIdx = idx;
  const ch = book.chapters[idx];
  audio.playbackRate = SPEEDS[state.speedIdx];
  if (audio.getAttribute('src') !== ch.file) audio.setAttribute('src', ch.file);
  audio.currentTime = startAt;
  $('player').hidden = false;
  setMini(true);
  $('p-cover').src = book.cover;
  $('p-cover-mini').src = book.cover;
  $('p-book').textContent = book.title;
  $('p-book-mini').textContent = book.title;
  $('p-chapter').textContent = 'Chương ' + ch.n + ' · ' + ch.title;
  $('p-chapter-mini').textContent = 'Chương ' + ch.n + ' · ' + ch.title;
  $('t-total').textContent = fmt(ch.duration_secs || 0);
  $('cm-book').textContent = book.title;
  $('cm-chapter').textContent = 'Chương ' + ch.n + ' · ' + ch.title;
  $('cm-total').textContent = fmt(ch.duration_secs || 0);
  $('cm-fill').style.width = '0%';
  markPlayingChapter();
  audio.play().catch(() => setPlayIcon(false));
  setMediaSession(book, ch);
  saveProgress();
  if (state.readalong) loadReadalong();
}

function setPlayIcon(playing) {
  $('ic-play').hidden = playing;
  $('ic-pause').hidden = !playing;
  $('ic-play-mini').hidden = playing;
  $('ic-pause-mini').hidden = !playing;
  $('ic-play-cm').hidden = playing;
  $('ic-pause-cm').hidden = !playing;
}

function setMini(m) {
  $('player').classList.toggle('mini', m);
}

function closePlayer() {
  audio.pause();
  $('player').hidden = true;
}

/* ---------- 1. chế độ lái xe ---------- */
function setCarmode(on) {
  $('carmode').hidden = !on;
  document.body.style.overflow = on ? 'hidden' : '';
  if (on && state.book) {
    const ch = curChapter();
    $('cm-book').textContent = state.book.title;
    $('cm-chapter').textContent = 'Chương ' + ch.n + ' · ' + ch.title;
    $('cm-total').textContent = fmt(audio.duration && isFinite(audio.duration) ? audio.duration : (ch.duration_secs || 0));
    $('cm-cur').textContent = fmt(audio.currentTime);
  }
}

/* ---------- 2. vừa nghe vừa đọc ---------- */
function splitSentences(text) {
  const out = [];
  const re = /[^.!?…\n]+[.!?…]+["”)\]]?|\n+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const t = m[0].replace(/\s+/g, ' ').trim();
    if (t.length > 1 && !/^\n+$/.test(m[0])) out.push(t);
  }
  return out.length ? out : [text.trim()].filter(Boolean);
}

async function loadReadalong() {
  const ch = curChapter();
  const box = $('p-sentences');
  state.sentences = [];
  state.activeSent = -1;
  if (!ch || !ch.script) {
    box.innerHTML = '<p class="loading">Chưa có bản chữ cho chương này.</p>';
    return;
  }
  box.innerHTML = '<p class="loading">Đang tải bản chữ…</p>';
  try {
    const res = await fetch(ch.script);
    if (!res.ok) throw new Error('fetch failed');
    const text = await res.text();
    const sents = splitSentences(text);
    const dur = (audio.duration && isFinite(audio.duration) ? audio.duration : 0) || ch.duration_secs || 1;
    const totalLen = sents.reduce((n, s) => n + s.length, 0) || 1;
    let t = 0;
    state.sentences = sents.map((s) => {
      const d = (s.length / totalLen) * dur;
      const seg = { text: s, start: t, end: t + d };
      t += d;
      return seg;
    });
    box.innerHTML = state.sentences.map((s, i) => `<span class="st" data-i="${i}"></span>`).join(' ');
    box.querySelectorAll('.st').forEach((el) => {
      el.textContent = state.sentences[Number(el.dataset.i)].text;
      el.addEventListener('click', () => { audio.currentTime = state.sentences[Number(el.dataset.i)].start + 0.01; });
    });
    updateReadalong(audio.currentTime);
  } catch {
    box.innerHTML = '<p class="loading">Không tải được bản chữ.</p>';
  }
}

function updateReadalong(t) {
  const segs = state.sentences;
  if (!segs.length) return;
  let idx = segs.length - 1;
  for (let i = 0; i < segs.length; i++) {
    if (t < segs[i].end) { idx = i; break; }
  }
  if (idx === state.activeSent) return;
  state.activeSent = idx;
  const box = $('p-sentences');
  box.querySelectorAll('.st.active').forEach((el) => el.classList.remove('active'));
  const el = box.querySelector(`.st[data-i="${idx}"]`);
  if (el) {
    el.classList.add('active');
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function setReadalong(on) {
  state.readalong = on;
  $('c-readalong').classList.toggle('on', on);
  $('p-readalong').hidden = !on;
  if (on) {
    setMini(false);
    if (state.book) loadReadalong();
  } else {
    state.sentences = [];
    state.activeSent = -1;
  }
}

/* ---------- 3. đánh dấu đoạn hay ---------- */
function openMarkSheet() {
  if (!state.book) return;
  const ch = curChapter();
  $('mark-sub').textContent = `${state.book.title} · Chương ${ch.n} · ${fmt(audio.currentTime)}`;
  $('mark-note').value = '';
  $('mark-backdrop').hidden = false;
  setTimeout(() => $('mark-note').focus(), 50);
}

function saveMark() {
  const ch = curChapter();
  if (!state.book || !ch) return;
  state.marks.unshift({
    id: Date.now(),
    bookSlug: state.book.slug,
    bookTitle: state.book.title,
    chapterIdx: state.chapterIdx,
    chapterN: ch.n,
    chapterTitle: ch.title,
    t: Math.floor(audio.currentTime),
    note: $('mark-note').value.trim(),
    at: Date.now(),
  });
  saveMarks();
  $('mark-backdrop').hidden = true;
}

function deleteMark(id) {
  state.marks = state.marks.filter((m) => m.id !== id);
  saveMarks();
  renderMarks();
}

function playMark(m) {
  const book = bookBySlug(m.bookSlug);
  if (!book || !book.chapters[m.chapterIdx]) return;
  goHome();
  playChapter(book, m.chapterIdx, Math.max(0, m.t - 2));
}

function renderMarks() {
  $('marks-count').textContent = state.marks.length ? state.marks.length + '' : '';
  $('marks-empty').hidden = state.marks.length > 0;
  $('marks-list').innerHTML = state.marks.map((m) => `
    <div class="mark-item glass">
      <div class="mark-info">
        <p class="mark-book">${escapeHtml(m.bookTitle)}</p>
        <p class="mark-chapter">Chương ${m.chapterN} · ${escapeHtml(m.chapterTitle)}</p>
        ${m.note ? `<p class="mark-note">${escapeHtml(m.note)}</p>` : ''}
        <p class="mark-time">▶ ${fmt(m.t)}</p>
      </div>
      <div class="mark-actions">
        <button class="mark-play" data-play="${m.id}" aria-label="Nghe từ đoạn này">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <button class="mark-del" data-del="${m.id}" aria-label="Xóa">🗑</button>
      </div>
    </div>`).join('');
  $('marks-list').querySelectorAll('[data-play]').forEach((b) =>
    b.addEventListener('click', () => playMark(state.marks.find((m) => m.id === Number(b.dataset.play))))
  );
  $('marks-list').querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => deleteMark(Number(b.dataset.del)))
  );
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function togglePlay() {
  if (!state.book) return;
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
}

function stepChapter(dir) {
  if (!state.book) return;
  const next = state.chapterIdx + dir;
  if (next < 0 || next >= state.book.chapters.length) return;
  playChapter(state.book, next);
}

function markPlayingChapter() {
  if ($('view-detail').hidden || !state.book) return;
  $('chapter-list').querySelectorAll('.chapter').forEach((li) => {
    const active = Number(li.dataset.idx) === state.chapterIdx && !audio.paused;
    li.classList.toggle('playing', active);
  });
}

function setMediaSession(book, ch) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Chương ' + ch.n + ' · ' + ch.title,
      artist: 'Boss · Kho Sách Nói',
      album: book.title,
      artwork: [{ src: book.cover, sizes: '1600x1600', type: 'image/jpeg' }],
    });
    navigator.mediaSession.setActionHandler('play', () => audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => stepChapter(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => stepChapter(1));
  } catch (e) { /* bỏ qua */ }
}

/* ---------- tiến trình / localStorage ---------- */
function saveProgress() {
  if (!state.book || !audio.currentTime) return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      book: state.book.slug,
      chapter: state.chapterIdx,
      time: Math.floor(audio.currentTime),
    }));
  } catch (e) { /* bỏ qua */ }
  refreshResumeBtn();
}

function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(LS_KEY));
    if (p && bookBySlug(p.book)) return p;
  } catch (e) { /* bỏ qua */ }
  return null;
}

function refreshResumeBtn() {
  const p = loadProgress();
  $('resume-btn').hidden = !p;
}

function resume() {
  const p = loadProgress();
  if (!p) return;
  const b = bookBySlug(p.book);
  if (!b) return;
  const idx = Math.min(p.chapter, b.chapters.length - 1);
  playChapter(b, idx, p.time || 0);
}

/* ---------- hẹn giờ tắt ---------- */
function clearTimer() {
  if (state.timerId) { clearTimeout(state.timerId); state.timerId = null; }
  state.timerEnd = 0;
  $('c-timer').textContent = '⏱ Tắt';
  $('c-timer').classList.remove('on');
}

function setTimer(min) {
  clearTimer();
  if (min > 0) {
    state.timerEnd = Date.now() + min * 60000;
    state.timerId = setTimeout(() => {
      audio.pause();
      clearTimer();
    }, min * 60000);
    $('c-timer').textContent = '⏱ ' + min + 'p';
    $('c-timer').classList.add('on');
  }
  $('timer-menu').hidden = true;
}

/* ---------- sự kiện audio ---------- */
audio.addEventListener('play', () => { setPlayIcon(true); markPlayingChapter(); });
audio.addEventListener('pause', () => { setPlayIcon(false); markPlayingChapter(); saveProgress(); });
audio.addEventListener('loadedmetadata', () => {
  if (audio.duration && isFinite(audio.duration)) $('t-total').textContent = fmt(audio.duration);
  if (state.readalong && state.book) loadReadalong();
});
audio.addEventListener('timeupdate', () => {
  const dur = audio.duration && isFinite(audio.duration) ? audio.duration : (curChapter()?.duration_secs || 0);
  $('t-cur').textContent = fmt(audio.currentTime);
  const pct = dur ? (audio.currentTime / dur) * 100 : 0;
  $('seek').value = Math.round(pct * 10);
  $('seek').style.setProperty('--fill', pct + '%');
  $('p-line-fill').style.width = pct + '%';
  if (!$('carmode').hidden) {
    $('cm-fill').style.width = pct + '%';
    $('cm-cur').textContent = fmt(audio.currentTime);
  }
  if (state.readalong) updateReadalong(audio.currentTime);
  if (++state.saveTick % 10 === 0) saveProgress(); // ~mỗi 2–3 giây
});
audio.addEventListener('ended', () => {
  saveProgress();
  if (state.book && state.chapterIdx + 1 < state.book.chapters.length) {
    playChapter(state.book, state.chapterIdx + 1); // tự chuyển chương tiếp theo
  } else {
    setPlayIcon(false);
    markPlayingChapter();
  }
});
audio.addEventListener('error', () => {
  $('p-chapter').textContent = 'Không tải được audio — kiểm tra lại file.';
});

/* ---------- sự kiện UI ---------- */
function bindUI() {
  $('logo').addEventListener('click', (e) => { e.preventDefault(); goHome(); });
  $('back-btn').addEventListener('click', goHome);
  $('resume-btn').addEventListener('click', resume);
  $('search').addEventListener('input', (e) => { state.query = e.target.value; renderGrid(); });

  $('c-play').addEventListener('click', togglePlay);
  $('c-play-mini').addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); });
  $('p-mini').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    setMini(false);
  });
  $('c-collapse').addEventListener('click', () => setMini(true));
  $('c-close-mini').addEventListener('click', (e) => { e.stopPropagation(); closePlayer(); });
  $('c-prev').addEventListener('click', () => stepChapter(-1));
  $('c-next').addEventListener('click', () => stepChapter(1));
  $('c-back15').addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
  $('c-fwd15').addEventListener('click', () => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 15); });
  $('c-close').addEventListener('click', closePlayer);

  // 3 tính năng mới
  $('marks-btn').addEventListener('click', goMarks);
  $('marks-back').addEventListener('click', goHome);

  $('c-carmode').addEventListener('click', () => setCarmode(true));
  $('cm-close').addEventListener('click', () => setCarmode(false));
  $('cm-play').addEventListener('click', togglePlay);
  $('cm-prev').addEventListener('click', () => stepChapter(-1));
  $('cm-next').addEventListener('click', () => stepChapter(1));
  $('cm-back15').addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
  $('cm-fwd15').addEventListener('click', () => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 15); });

  $('c-readalong').addEventListener('click', () => setReadalong(!state.readalong));

  $('c-mark').addEventListener('click', openMarkSheet);
  $('mark-cancel').addEventListener('click', () => { $('mark-backdrop').hidden = true; });
  $('mark-save').addEventListener('click', saveMark);
  $('mark-backdrop').addEventListener('click', (e) => {
    if (e.target === $('mark-backdrop')) $('mark-backdrop').hidden = true;
  });

  $('seek').addEventListener('input', () => {
    const dur = audio.duration && isFinite(audio.duration) ? audio.duration : (curChapter()?.duration_secs || 0);
    if (dur) audio.currentTime = ($('seek').value / 1000) * dur;
  });

  $('c-speed').addEventListener('click', () => {
    state.speedIdx = (state.speedIdx + 1) % SPEEDS.length;
    audio.playbackRate = SPEEDS[state.speedIdx];
    $('c-speed').textContent = SPEEDS[state.speedIdx] + 'x';
  });

  $('c-timer').addEventListener('click', (e) => {
    e.stopPropagation();
    $('timer-menu').hidden = !$('timer-menu').hidden;
  });
  $('timer-menu').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => setTimer(Number(b.dataset.min)))
  );
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.timer-menu') && !e.target.closest('#c-timer')) $('timer-menu').hidden = true;
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(); });
  window.addEventListener('beforeunload', saveProgress);
}

bindUI();
loadBooks().catch((err) => {
  $('grid').innerHTML = `<p class="empty">Lỗi tải dữ liệu: ${err.message}. Hãy chạy qua http server (xem README).</p>`;
});
