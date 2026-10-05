// Dev only. Not imported by the app, so it never reaches a bundle.
//
// fillDemo runs inside the page (pass it to Playwright's page.evaluate, or
// paste its body in the console) on a seeded local mode app. It moves the
// challenge start back so today is day `day`, then writes mixed day_log rows,
// two progress photos and one weekly coach note into localStorage.
//
//   node src/features/progress/dev/shots.mjs http://localhost:3104

export async function fillDemo({ day = 17, photos = true, note = true } = {}) {
  const P = "lockin:v1:";
  const read = (t) => JSON.parse(localStorage.getItem(P + t) || "[]");
  const write = (t, rows) => localStorage.setItem(P + t, JSON.stringify(rows));
  const nyToday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const add = (date, n) => {
    const [y, m, d] = date.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    const p = (x) => String(x).padStart(2, "0");
    return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
  };
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const id = () => crypto.randomUUID();
  const stamp = new Date().toJSON();

  const start = add(nyToday, -(day - 1));
  const challenge = read("challenge");
  if (challenge[0]) {
    challenge[0].start_date = start;
    challenge[0].money_deadline = add(start, 9);
  }
  write("challenge", challenge);

  const items = read("checklist_item").filter((i) => i.active);
  const key = (k) => items.find((i) => i.key === k);
  // How often each item lands, so some hold and some slip.
  const odds = { wake: 0.62, workout: 0.9, core: 0.72, calories: 0.7, protein: 0.8, earned: 0.58, study: 0.78, business: 0.66, bed: 0.5, vice_smoking: 0.97, vice_drinking: 0.88, vice_masturbation: 0.8 };
  const full = new Set([1, 2, 3, 7, 11, 12, 15]);
  const blank = new Set([9]);
  const logs = [];
  const log = (item, date, p) => logs.push({ id: id(), created_at: stamp, date, item_id: item.id, value: null, checked: false, text: null, completed_at: null, ...p });

  for (let n = 1; n <= day; n++) {
    const date = add(start, n - 1);
    if (blank.has(n)) continue;
    const isToday = n === day;
    for (const item of items.filter((i) => i.cadence === "daily")) {
      const hit = full.has(n) || rnd() < (odds[item.key] ?? 0.7);
      // Today is half done: the morning items only.
      if (isToday && !["wake", "workout", "core", "vice_smoking"].includes(item.key)) continue;
      if (item.key === "calories") log(item, date, { value: hit ? 1900 + Math.round(rnd() * 20) * 10 : 2300 + Math.round(rnd() * 40) * 10, checked: true, completed_at: stamp });
      else if (item.key === "protein") log(item, date, { value: hit ? 180 + Math.round(rnd() * 30) : 120 + Math.round(rnd() * 50), checked: true, completed_at: stamp });
      else if (item.key === "earned") log(item, date, { value: hit ? 100 + Math.round(rnd() * 90) : Math.round(rnd() * 80), checked: true, completed_at: stamp });
      else if (item.type === "text") { if (hit) log(item, date, { checked: true, text: "Followed up with the school contact", completed_at: stamp }); }
      else if (hit) log(item, date, { checked: true });
    }
  }
  const friday = (week) => { for (let n = 1; n <= day; n++) { const d = add(start, n - 1); const [y, m, dd] = d.split("-").map(Number); if (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() === 5 && --week === 0) return d; } return null; };
  const weigh = key("weighin");
  const talk = key("talk");
  const body = [];
  [friday(1), friday(2)].forEach((d, i) => {
    if (!d) return;
    if (weigh) log(weigh, d, { value: 192 - i * 2.4, checked: true, completed_at: stamp });
    body.push({ id: id(), created_at: stamp, date: d, weight: 192 - i * 2.4, photo_url: null });
  });
  if (talk) log(talk, add(start, 2), { checked: true });
  write("day_log", logs);

  if (photos) {
    const shot = (hue, slim) => {
      const c = document.createElement("canvas");
      c.width = 600; c.height = 800;
      const g = c.getContext("2d");
      const bg = g.createLinearGradient(0, 0, 0, 800);
      bg.addColorStop(0, `hsl(${hue} 18% 34%)`); bg.addColorStop(1, `hsl(${hue} 22% 12%)`);
      g.fillStyle = bg; g.fillRect(0, 0, 600, 800);
      g.fillStyle = `hsl(${hue} 14% 62%)`;
      g.beginPath(); g.arc(300, 210, 78, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(300, 620, 190 - slim, 330, 0, 0, Math.PI * 2); g.fill();
      return c.toDataURL("image/jpeg", 0.85);
    };
    const put = (pid, value) => new Promise((res, rej) => {
      const req = indexedDB.open("lockin-photos", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("photos");
      req.onerror = () => rej(req.error);
      req.onsuccess = () => { const tx = req.result.transaction("photos", "readwrite"); tx.objectStore("photos").put(value, pid); tx.oncomplete = () => { req.result.close(); res(); }; tx.onerror = () => rej(tx.error); };
    });
    await put("demo-before", shot(215, 0));
    await put("demo-after", shot(28, 34));
    body.unshift({ id: id(), created_at: stamp, date: start, weight: 194, photo_url: "idb:demo-before" });
    const last = body[body.length - 1];
    if (last && last.date !== start) last.photo_url = "idb:demo-after";
  }
  write("body_log", body);

  if (note) {
    write("coach_note", [{ id: id(), created_at: stamp, date: add(start, 13), kind: "weekly", source: "fallback",
      body: "Workout and no smoking held all week. Protein landed five days out of seven.\n\nBed on time slipped four nights, and the wake check followed it the next morning each time.\n\nOne change: phone on the charger across the room at 10:30." }]);
  }
  return { start, logs: logs.length };
}
