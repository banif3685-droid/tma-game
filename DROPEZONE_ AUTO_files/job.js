// ===== Подработка (релизное обновление): мини-игра «Мойка» =====
// Меню → «Подработка». На машине пятна грязи — тапни все, и мойка оплачена (5–15 тыс, раз в 10 минут).
// Награду и перезарядку решает сервер (Rules.actions.job); мини-игра — только экран.

let jobSpots = null;      // пятна текущей мойки: [{ x, y, s, r }] в процентах сцены
let jobCar = null;        // какая машина на мойке (id)
let jobFx = '';           // показ награды после мойки

function jobNewRound() {
  const cars = [...state.cars].sort((a, b) => carValue(b) - carValue(a));
  jobCar = (cars[Math.floor(Math.random() * Math.min(3, cars.length))] || null);
  jobSpots = Array.from({ length: JOB.spots }, () => ({
    x: 14 + Math.random() * 72, y: 28 + Math.random() * 48,   // примерно по кузову
    s: 34 + Math.random() * 26, r: Math.random() * 360,
  }));
}

function renderJob() {
  const left = Rules.jobLeft(state, now());
  if (!jobSpots) jobNewRound();
  const pic = jobCar ? carPicOf(jobCar) : carPic(CAR_BY_ID[state.discovered[0]] || CARS[0]);
  if (left > 0) {
    return `${jobFx}
      <div class="job-stage clean">${pic}<div class="job-shine"></div></div>
      <div class="card job-card"><div class="t">${emo('⏳', 20)} Следующая мойка через <b data-job-cd="${now() + left}">${mmssJob(left)}</b></div>
        <div class="muted small">Мойка — раз в ${JOB.cdMs / 60e3} минут. А пока можно погоняться на «Тренировке» — без взноса</div></div>`;
  }
  const done = jobSpots.filter(s => s.gone).length;
  return `${jobFx}
    <div class="job-stage" id="job-stage">${pic}
      ${jobSpots.map((s, i) => s.gone ? '' : `<button class="dirt" data-act="job-spot" data-i="${i}" aria-label="Пятно"
        style="left:${s.x}%;top:${s.y}%;--s:${s.s}px;--r:${s.r}deg"></button>`).join('')}
    </div>
    <div class="card job-card"><div class="t">${emo('🧽', 20)} Мойка · отмой все пятна</div>
      <div class="job-bar"><i style="width:${done / JOB.spots * 100}%"></i></div>
      <div class="muted small">Осталось ${JOB.spots - done} из ${JOB.spots} · оплата ${money(JOB.min)}–${money(JOB.max)}</div></div>`;
}
const mmssJob = ms => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

async function jobSpot(el) {
  const i = +el.dataset.i;
  if (!jobSpots?.[i] || jobSpots[i].gone || busy) return;
  jobSpots[i].gone = true;
  haptic.tick();
  el.classList.add('gone');   // пятно смывается (анимация), потом перерисуем
  const done = jobSpots.filter(s => s.gone).length;
  const bar = document.querySelector('.job-bar i');
  if (bar) bar.style.width = `${done / JOB.spots * 100}%`;
  const note = document.querySelector('.job-card .muted');
  if (note) note.textContent = `Осталось ${JOB.spots - done} из ${JOB.spots} · оплата ${money(JOB.min)}–${money(JOB.max)}`;
  if (done < JOB.spots) return;
  const r = await api('job', {});
  jobSpots = null;
  if (r) {
    haptic.ok();
    updateBalance(true);
    jobFx = `<div class="job-paid">${emo('✨', 22)} Машина блестит! <b>+${money(r.money)}</b></div>`;
    toast(`🧽 Мойка оплачена: +${money(r.money)}`);
  }
  if (menuView === 'job') $('#menu-body').innerHTML = renderJob();
}

// отсчёт до следующей мойки
setInterval(() => {
  const el = document.querySelector('[data-job-cd]');
  if (!el) return;
  const left = +el.dataset.jobCd - now();
  if (left > 0) el.textContent = mmssJob(left);
  else if (menuView === 'job') { jobFx = ''; $('#menu-body').innerHTML = renderJob(); }
}, 1000);

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act="job-spot"]');
  if (el) jobSpot(el);
});
