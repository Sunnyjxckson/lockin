"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Home, Receipt, Share2, ShoppingBasket, ShoppingCart, Trash2 } from "lucide-react";
import { Button, Card, Checkbox, DateField, EmptyState, NumberField, PageHeader, Screen, Section, Select, Sheet, TextField, Toggle, cn, useToast } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { formatDateShort } from "@/lib/logic/dates";
import { dollars, foodKey, round, SECTION_LABEL, SECTIONS } from "@/lib/logic/meals";
import { budgetActual, buyLabel, compareStores, displayName, instacartItems, listAsText, needLabel, type GroceryLine } from "@/lib/logic/mealsGrocery";
import { STORES, type Store } from "@/lib/logic/mealsPricing";
import type { Expense } from "@/lib/types";
import { recordShop, removeShop, setAtHome, setBought, setPlanStore, setReceiptPrice, syncGrocery } from "./data";
import { Est, EstimateNote } from "./parts";
import { currentWeek, useKeepInStep, useMeals, type MealsState } from "./useMeals";

type Instacart = "unknown" | "ready" | "off";

export default function GroceryScreen() {
  const toast = useToast();
  const m = useMeals(currentWeek());
  useKeepInStep(m);
  const [item, setItem] = useState<string | null>(null);
  const [shop, setShop] = useState(false);
  const [instacart, setInstacart] = useState<Instacart>("unknown");
  const [sending, setSending] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    let live = true;
    fetch("/api/meals/instacart", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { connected?: boolean } | null) => live && setInstacart(j?.connected ? "ready" : "off"))
      .catch(() => live && setInstacart("off"));
    return () => {
      live = false;
    };
  }, []);

  const stores = useMemo(() => compareStores(m.lines, m.source, m.pantry), [m.lines, m.source, m.pantry]);
  const header = <PageHeader title="Grocery list" back="/meals" subtitle={m.plan ? `Week of ${formatDateShort(m.weekStart)}` : undefined} />;

  if (m.loading) {
    return (
      <Screen>
        {header}
        <div className="mt-4 h-64 rounded-[20px] bg-surface" aria-busy="true" aria-label="Loading" />
      </Screen>
    );
  }

  if (!m.plan || m.lines.length === 0) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon={<ShoppingBasket size={24} aria-hidden />}
          title="Nothing to buy yet"
          body="Build a week of meals first. Its ingredients are combined into one list here, priced at five stores."
          action={
            <a href="/meals" className="pressable inline-flex h-12 items-center rounded-[14px] bg-ink px-5 text-[16px] font-semibold text-bg">
              Plan the week
            </a>
          }
        />
      </Screen>
    );
  }

  const plan = m.plan;
  const save = { recipes: m.recipes, book: m.book };
  const rowOf = (line: GroceryLine) => m.rows.find((r) => foodKey(r.name) === foodKey(line.name)) ?? null;
  const toBuy = m.lines.filter((l) => !m.pantry.has(foodKey(l.name)));
  const atHome = m.lines.filter((l) => m.pantry.has(foodKey(l.name)));
  const here = stores.find((s) => s.store === m.store) ?? stores[0];
  const cheapest = stores[0];
  const boughtCount = toBuy.filter((l) => rowOf(l)?.bought).length;
  const title = `Groceries, week of ${formatDateShort(m.weekStart)}`;
  const text = listAsText(m.lines, m.pantry, title, SECTION_LABEL);
  const ba = budgetActual(plan.budget, here.total, m.spent);
  const max = Math.max(...stores.map((s) => s.total), 1);

  const priceOf = (line: GroceryLine): { amount: number; real: boolean } => {
    if (!line.food) return { amount: line.ownCost, real: false };
    const q = m.source.quote(line.food, m.store);
    return { amount: round(q.price * line.packs, 2), real: q.source !== "estimate" };
  };

  const pickStore = async (store: Store) => {
    if (store === m.store) return;
    haptics.tap();
    try {
      await setPlanStore(plan, store, save);
      toast(`Priced at ${store}`, { kind: "done" });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not change the store", { kind: "error" });
    }
  };

  const tick = async (line: GroceryLine, bought: boolean) => {
    try {
      const row = rowOf(line);
      if (row) await setBought(row, bought);
      else await syncGrocery(plan, save);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save that", { kind: "error" });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      haptics.done();
      toast("List copied", { kind: "done" });
    } catch {
      toast("Could not copy. Select the text and copy it by hand.", { kind: "error" });
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title, text });
    } catch {
      // Closed the share sheet. Nothing to do.
    }
  };

  const order = async () => {
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/meals/instacart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ title, items: instacartItems(m.lines, m.pantry), linkback: window.location.origin.startsWith("https://") ? `${window.location.origin}/meals/grocery` : undefined }),
      });
      const json = (await res.json().catch(() => null)) as { url?: string } | null;
      if (json?.url) window.location.assign(json.url);
      else {
        await copy();
        toast("Instacart did not take the list. It is copied so you can paste it.", { kind: "error", duration: 5000 });
      }
    } catch {
      toast("Could not reach Instacart", { kind: "error" });
    } finally {
      setSending(false);
    }
  };

  const openLine = item ? (m.lines.find((l) => foodKey(l.name) === item) ?? null) : null;

  return (
    <Screen>
      {header}

      <Card className="mt-2" data-store-compare>
        <p className="t-label">Same list, five stores</p>
        <p className="mt-1.5 text-[15px] text-ink">
          Cheapest: <span className="font-semibold">{cheapest.store}</span>, <Est>{dollars(cheapest.total)}</Est>
          {here.above > 0.004 ? <span className="text-ink-3">. {m.store} is about {dollars(here.above)} more.</span> : <span className="text-ink-3">. That is where you are shopping.</span>}
        </p>
        <ul className="mt-3 flex flex-col gap-1.5" aria-label="Stores">
          {stores.map((s) => {
            const on = s.store === m.store;
            return (
              <li key={s.store}>
                <button
                  type="button"
                  onClick={() => pickStore(s.store)}
                  aria-pressed={on}
                  className={cn("pressable relative flex h-12 w-full items-center gap-3 overflow-hidden rounded-[12px] border px-3.5 text-left", on ? "border-ink" : "border-line")}
                >
                  <span className="absolute inset-y-0 left-0 bg-surface-3" style={{ width: `${Math.round((s.total / max) * 100)}%` }} aria-hidden />
                  <span className="relative flex min-w-0 flex-1 items-center gap-2 text-[15px] font-medium text-ink">
                    {on ? <Check size={16} aria-hidden /> : null}
                    <span className="truncate">{s.store}</span>
                    {s.fromReceipts > 0 ? <span className="text-[12px] font-normal text-ink-3">{s.fromReceipts} from receipts</span> : null}
                  </span>
                  <span className="relative shrink-0 text-[15px] text-ink">
                    <Est real={s.fromReceipts === s.lines && s.lines > 0}>{dollars(s.total)}</Est>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <EstimateNote className="mt-3" receipts={here.fromReceipts} />
      </Card>

      <Card className="mt-3" data-budget-actual>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="t-num-sm tnum">{dollars(ba.budget)}</p>
            <p className="t-label mt-0.5">Budget</p>
          </div>
          <div>
            <p className="t-num-sm tnum">{dollars(ba.estimated)}</p>
            <p className="t-label mt-0.5">Estimate</p>
          </div>
          <div>
            <p className={cn("t-num-sm tnum", ba.over && "text-warn")}>{ba.spent > 0 ? dollars(ba.spent) : "$0"}</p>
            <p className="t-label mt-0.5">Spent</p>
          </div>
        </div>
        {ba.spent > 0 ? (
          <p className={cn("mt-3 text-[15px]", ba.over ? "text-warn" : "text-ink")}>
            {ba.over ? `${dollars(-ba.left)} over budget.` : `${dollars(ba.left)} of the budget left.`}
            {ba.offEstimate !== null ? (
              <span className="text-ink-3">
                {" "}
                {Math.abs(ba.offEstimate) < 0.5 ? "Right on the estimate." : `${dollars(Math.abs(ba.offEstimate))} ${ba.offEstimate > 0 ? "more" : "less"} than the estimate.`}
              </span>
            ) : null}
          </p>
        ) : null}
        {m.shops.length > 0 ? (
          <ul className="mt-3 divide-y divide-line rounded-[12px] border border-line">
            {m.shops.map((e) => (
              <ShopRow key={e.id} expense={e} />
            ))}
          </ul>
        ) : null}
        <Button full className="mt-3" variant={boughtCount === toBuy.length && toBuy.length > 0 ? "primary" : "secondary"} onClick={() => setShop(true)} icon={<Receipt size={18} aria-hidden />}>
          {m.shops.length > 0 ? "Add another shop" : "Done shopping, record it"}
        </Button>
      </Card>

      <p className="mt-6 px-1 text-[15px] text-ink-2" role="status">
        <span className="tnum font-semibold text-ink">
          {boughtCount} of {toBuy.length}
        </span>{" "}
        in the cart
      </p>

      {SECTIONS.map((section) => {
        const lines = toBuy.filter((l) => l.section === section);
        if (lines.length === 0) return null;
        return (
          <Section key={section} title={SECTION_LABEL[section]}>
            <Card padded={false} className="overflow-hidden">
              <ul className="divide-y divide-line">
                {lines.map((line) => {
                  const row = rowOf(line);
                  const p = priceOf(line);
                  const done = !!row?.bought;
                  return (
                    <li key={line.name} className="flex min-h-[60px] items-center gap-3 pr-2 pl-4">
                      <Checkbox checked={done} onChange={(v) => tick(line, v)} label={displayName(line.name)} />
                      <button type="button" onClick={() => setItem(foodKey(line.name))} className="pressable flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-2 text-left">
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-[16px] font-medium", done ? "text-ink-3 line-through" : "text-ink")}>{displayName(line.name)}</span>
                          <span className="mt-0.5 block truncate text-[13px] text-ink-3">
                            {buyLabel(line)}
                            {line.food ? `, recipes use ${needLabel(line)}` : ""}
                          </span>
                        </span>
                        <span className={cn("shrink-0 text-[15px]", done ? "text-ink-3" : "text-ink-2")}>
                          <Est real={p.real}>{dollars(p.amount)}</Est>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </Section>
        );
      })}

      {atHome.length > 0 ? (
        <Section title="Already at home">
          <Card padded={false} className="overflow-hidden">
            <ul className="divide-y divide-line">
              {atHome.map((line) => (
                <li key={line.name}>
                  <button type="button" onClick={() => setItem(foodKey(line.name))} className="pressable flex min-h-[52px] w-full items-center gap-3 px-4 text-left">
                    <Home size={18} className="shrink-0 text-ink-3" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[15px] text-ink-2">{displayName(line.name)}</span>
                    <span className="shrink-0 text-[13px] text-ink-3">recipes use {needLabel(line)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <p className="mt-2 px-1 text-[13px] text-ink-3">Not on the list and not in the total. Tap one if you have run out.</p>
        </Section>
      ) : null}

      <Section title="Send the list">
        <div className="flex flex-col gap-2.5">
          {instacart === "ready" ? (
            <Button full size="lg" onClick={order} loading={sending} icon={<ShoppingCart size={18} aria-hidden />}>
              Order on Instacart
            </Button>
          ) : null}
          <div className="flex gap-2.5">
            <Button full variant="secondary" onClick={copy} icon={<Copy size={18} aria-hidden />}>
              Copy list
            </Button>
            {canShare ? (
              <Button full variant="secondary" onClick={share} icon={<Share2 size={18} aria-hidden />}>
                Share
              </Button>
            ) : null}
          </div>
          {instacart === "off" ? (
            <p className="px-1 text-[13px] text-ink-3" data-instacart-off>
              Instacart is not connected. Set INSTACART_API_KEY on the server and an Order on Instacart button appears here. Until then, copy the list and paste it into any store&apos;s app.
            </p>
          ) : null}
        </div>
      </Section>

      {openLine ? <ItemSheet key={openLine.name} m={m} line={openLine} onClose={() => setItem(null)} /> : null}
      {shop ? <ShopSheet m={m} estimate={here.total} onClose={() => setShop(false)} /> : null}
    </Screen>
  );
}

function ShopRow({ expense }: { expense: Expense }) {
  const toast = useToast();
  return (
    <li className="flex min-h-[48px] items-center gap-3 pr-1 pl-3.5">
      <span className="min-w-0 flex-1 truncate text-[14px] text-ink-2">
        {formatDateShort(expense.date)}
        {expense.store ? `, ${expense.store}` : ""}
        {expense.note ? `, ${expense.note}` : ""}
      </span>
      <span className="tnum shrink-0 text-[15px] font-medium text-ink">{dollars(expense.amount)}</span>
      <button
        type="button"
        aria-label={`Delete the ${dollars(expense.amount)} shop`}
        onClick={() => removeShop(expense).then(() => toast("Shop removed"))}
        className="pressable flex size-11 shrink-0 items-center justify-center rounded-full text-ink-3"
      >
        <Trash2 size={17} aria-hidden />
      </button>
    </li>
  );
}

/** One item: have it at home, and what a pack really costs at each store. */
function ItemSheet({ m, line, onClose }: { m: MealsState; line: GroceryLine; onClose: () => void }) {
  const toast = useToast();
  const home = m.pantry.has(foodKey(line.name));
  const food = line.food;
  const toggleHome = async (v: boolean) => {
    try {
      await setAtHome(line.name, v);
      toast(v ? "Marked as at home. It is off the list." : "Back on the list", { kind: "done" });
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save that", { kind: "error" });
    }
  };

  const setPrice = async (store: Store, price: number | null) => {
    if (!food) return;
    const current = m.book.corrections[food.name]?.[store] ?? null;
    if (price === current) return;
    try {
      await setReceiptPrice(food.name, store, price);
      haptics.tap();
      toast(price === null ? `Back to the estimate at ${store}` : `Saved. ${store} uses your price from now on.`, { kind: "done" });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the price", { kind: "error" });
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={displayName(line.name)}
      subtitle={`Buy ${buyLabel(line)}${food ? `. Recipes use ${needLabel(line)}.` : ""}`}
    >
      <div className="flex items-center justify-between gap-4 rounded-[14px] bg-surface-2 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[16px] font-medium text-ink">I have this at home</p>
          <p className="mt-0.5 text-[13px] text-ink-3">Takes it off the list and out of the total, this week and after.</p>
        </div>
        <Toggle checked={home} onChange={toggleHome} label="I have this at home" />
      </div>

      {food ? (
        <>
          <h3 className="t-label mt-6">
            Price for one {food.packLabel === "each" ? "" : `${food.packLabel} `}
            {food.packLabel === "each" ? displayName(food.name).toLowerCase() : ""}
          </h3>
          <p className="mt-1 mb-3 text-[13px] text-ink-3">These are estimates. Type what your receipt says and that store uses your number from then on. Clear a field to go back to the estimate.</p>
          <div className="flex flex-col gap-2.5">
            {STORES.map((store) => {
              const own = m.book.corrections[food.name]?.[store];
              const est = m.source.quote(food, store);
              const estimate = own === undefined ? est.price : null;
              return (
                <div key={store} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-[15px]", store === m.store ? "font-semibold text-ink" : "text-ink")}>{store}</p>
                    <p className="text-[12px] text-ink-3">{own !== undefined ? "From your receipt" : `Estimate ${dollars(estimate ?? 0)}`}</p>
                  </div>
                  <div className="w-[132px] shrink-0">
                    <NumberField value={own ?? null} onChange={(v) => setPrice(store, v)} prefix="$" placeholder={(estimate ?? est.price).toFixed(2)} max={500} aria-label={`${store} price`} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="t-sub mt-5">This ingredient is not in the food table, so its cost comes from the recipe it is in.</p>
      )}
    </Sheet>
  );
}

/** A shop is done: write the spend to Money as a groceries expense. */
function ShopSheet({ m, estimate, onClose }: { m: MealsState; estimate: number; onClose: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState<number | null>(null);
  const [store, setStore] = useState<string>(m.store);
  const [date, setDate] = useState(m.today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = amount !== null && amount > 0;

  const save = async () => {
    if (!ok || busy || !m.plan) return;
    setBusy(true);
    try {
      await recordShop(m.plan, { date, amount: amount!, store, note });
      haptics.done();
      toast(`${dollars(amount!)} recorded. It shows on Money as groceries.`, { kind: "done" });
      onClose();
    } catch (e) {
      haptics.error();
      toast(e instanceof Error ? e.message : "Could not record the shop", { kind: "error" });
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Record the shop"
      subtitle={`The estimate was ${dollars(estimate)}. Type the receipt total.`}
      footer={
        <Button full size="lg" onClick={save} disabled={!ok} loading={busy}>
          Record spend
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <NumberField label="Receipt total" prefix="$" value={amount} onChange={setAmount} live autoFocus placeholder={estimate.toFixed(2)} max={5000} />
        <Select label="Store" value={store} onChange={setStore} options={[...STORES.map((s) => ({ value: s as string, label: s as string })), { value: "Other", label: "Other" }]} />
        <DateField label="Date" value={date} onChange={setDate} max={m.today} />
        <TextField label="Note" value={note} onChange={setNote} placeholder="Optional" maxLength={80} />
      </div>
    </Sheet>
  );
}
