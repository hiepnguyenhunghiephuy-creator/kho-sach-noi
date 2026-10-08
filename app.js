/* Kho Sách Nói — app logic. Mọi dữ liệu sách đều fetch từ data/books.json */
'use strict';

const LS_KEY = 'kho-sach-noi-progress-v1';
const CATEGORIES = ['Tất cả', 'Động lực', 'Kinh doanh', 'Kỹ năng', 'Tiếng Anh'];
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
};

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
  $('view-detail').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goHome() {
  $('view-detail').hidden = true;
  $('view-home').hidden = false;
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
  markPlayingChapter();
  audio.play().catch(() => setPlayIcon(false));
  setMediaSession(book, ch);
  saveProgress();
}

function setPlayIcon(playing) {
  $('ic-play').hidden = playing;
  $('ic-pause').hidden = !playing;
  $('ic-play-mini').hidden = playing;
  $('ic-pause-mini').hidden = !playing;
}

function setMini(m) {
  $('player').classList.toggle('mini', m);
}

function closePlayer() {
  audio.pause();
  $('player').hidden = true;
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
});
audio.addEventListener('timeupdate', () => {
  const dur = audio.duration && isFinite(audio.duration) ? audio.duration : (curChapter()?.duration_secs || 0);
  $('t-cur').textContent = fmt(audio.currentTime);
  const pct = dur ? (audio.currentTime / dur) * 100 : 0;
  $('seek').value = Math.round(pct * 10);
  $('seek').style.setProperty('--fill', pct + '%');
  $('p-line-fill').style.width = pct + '%';
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
