// ===== Приглашения друзей: раздел «Меню» → «Друзья» =====
// Ссылка t.me/dropezone_bot/dropezone?startapp=r<ID>. Деньги начисляет сервер, когда друг впервые входит в игру.

let friendsData = null;   // ответ сервера: { count, earned, friends, link }

const myRefLink = () => friendsData?.link || REFERRAL.link + (tgUser()?.id ?? '');
const shareText = () => `Залетай в DROPEZONE: AUTO 🏁 Собирай гараж из реальных тачек, тюнингуй и гоняй! По моей ссылке — ${money(REFERRAL.friend)} на старт 🎁`;

function renderFriends() {
  if (MODE !== 'server') {
    return `<div class="card empty-state">${emo('👥', 56)}<h3>Приглашения</h3>
      <p class="muted">Работают, когда игра открыта в Telegram</p></div>`;
  }
  const d = friendsData;
  const list = !d ? `<div class="card" style="text-align:center"><span class="muted">Загрузка…</span></div>`
    : d.friends.length ? `<div class="list">${d.friends.map(f => `<div class="list-row">
        <div class="ic">${emo('🏎️', 22)}</div>
        <div class="info"><div class="t">${esc(f.name) || 'Гонщик'}${f.username ? ` <span class="muted small">@${esc(f.username)}</span>` : ''}</div>
          <div class="sub">уровень ${f.level ?? 1} · ${new Date(f.at).toLocaleDateString('ru-RU')}</div></div>
        ${f.paid ? `<div class="r ok">+${money(REFERRAL.inviter)}</div>` : `<div class="r muted small">ждём ${REFERRAL.minLevel} ур.</div>`}</div>`).join('')}</div>`
    : `<div class="card" style="text-align:center"><span class="muted">Пока никого — поделись ссылкой 👆</span></div>`;
  return `<div class="card friends-card">
      <div class="promo-hero friends-hero">${emo('👥', 52)}</div>
      <h3>Зови друзей</h3>
      <p class="muted">За каждого друга — <b>${money(REFERRAL.inviter)}</b> тебе, когда он дойдёт до <b>${REFERRAL.minLevel} уровня</b>, и <b>${money(REFERRAL.friend)}</b> ему на старт</p>
      <button class="ref-link" data-act="ref-copy">${esc(myRefLink().replace('https://', ''))}</button>
      <div class="row-btns">
        <button class="btn" data-act="ref-share">Поделиться</button>
        <button class="btn gray" data-act="ref-copy">Скопировать</button>
      </div>
    </div>
    <div class="admin-stats friends-stats">
      <div><b>${d ? d.count : '—'}</b><span>приглашено</span></div>
      <div><b>${d ? money(d.earned) : '—'}</b><span>заработано</span></div>
    </div>
    <div class="section-h">Твои друзья</div>
    ${list}`;
}

async function loadFriends() {
  if (MODE !== 'server') return;
  try {
    const res = await fetch(API + '/friends', { headers: authHeaders() });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    friendsData = data;
  } catch {
    toast('Не удалось загрузить друзей');
    return;
  }
  if (tab === 'menu' && menuView === 'friends' && $('#menu-body')) $('#menu-body').innerHTML = renderFriends();
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act="ref-copy"], [data-act="ref-share"]');
  if (!el) return;
  const link = myRefLink();
  if (el.dataset.act === 'ref-share') {
    haptic.tap();
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText())}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
    return;
  }
  try { await navigator.clipboard.writeText(link); haptic.ok(); toast('Ссылка скопирована'); }
  catch { toast(link); }
});
