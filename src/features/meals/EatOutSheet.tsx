"use client";

import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { Button, EmptyState, List, Sheet, cn, useToast } from "@/components/ui";
import { useList } from "@/lib/db/hooks";
import { haptics } from "@/lib/haptics";
import { formatDateLong } from "@/lib/logic/dates";
import { mealTotals } from "@/lib/logic/body";
import { directionsUrl, findOrders, remainingFor, type Chain, type ChainData, type DayState, type EatOutOrder } from "@/lib/logic/eatOut";
import { dollars, SLOT_LABEL } from "@/lib/logic/meals";
import type { DateStr, MealSlot } from "@/lib/types";
import chainJson from "@/data/restaurants/chains.json";
import { eatOut } from "./eatOutData";
import { Est, fmt } from "./parts";
import type { MealsState } from "./useMeals";

const DATA = chainJson as unknown as ChainData;
const LOCATION = "Charlotte, NC";

interface LocalSpot extends EatOutOrder {
  estimate: true;
}

/** The numbers an eat out order has to fit for one planned meal. */
function useDayState(m: MealsState, date: DateStr, slot: MealSlot): DayState {
  const logged = useList("meal", { eq: { date } });
  return useMemo(() => {
    const t = m.ctx.targetsByDate?.[date] ?? m.targets;
    const eaten = mealTotals(logged.data, date);
    let plannedCalories = 0;
    let plannedProtein = 0;
    for (const x of m.meals) {
      if (x.date !== date || x.slot === slot || x.logged) continue;
      const r = m.recipeById.get(x.recipe_id);
      if (!r) continue;
      plannedCalories += r.calories * x.servings;
      plannedProtein += r.protein * x.servings;
    }
    return { calMin: t.calMin, calMax: t.calMax, proteinMin: t.proteinMin, eatenCalories: eaten.calories, eatenProtein: eaten.protein, plannedCalories, plannedProtein };
  }, [m.ctx.targetsByDate, m.targets, m.meals, m.recipeById, logged.data, date, slot]);
}

/** Pick a restaurant order for a planned meal when cooking is off. */
export function EatOutSheet({ m, date, slot, onBack, onClose }: { m: MealsState; date: DateStr; slot: MealSlot; onBack: () => void; onClose: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [spots, setSpots] = useState<LocalSpot[]>([]);
  const [spotState, setSpotState] = useState<"idle" | "loading" | "none">("idle");

  const day = useDayState(m, date, slot);
  const left = remainingFor(day);
  const orders = useMemo(() => findOrders({ remaining: left, slot, chains: DATA.chains as Chain[], dislikes: m.dislikes, limit: 5 }), [left.calMin, left.calMax, left.protein, slot, m.dislikes]); // eslint-disable-line react-hooks/exhaustive-deps

  const take = async (order: EatOutOrder) => {
    if (!m.plan || busy) return;
    setBusy(order.id);
    try {
      await eatOut(m.plan, date, slot, order, { recipes: m.recipes, book: m.book });
      haptics.done();
      toast(`Logged ${fmt(order.calories)} kcal and ${fmt(order.protein)}g protein`, { kind: "done" });
      onClose();
    } catch (e) {
      haptics.error();
      toast(e instanceof Error ? e.message : "Could not log the order", { kind: "error" });
      setBusy(null);
    }
  };

  const findSpots = async () => {
    setSpotState("loading");
    try {
      const res = await fetch("/api/meals/eat-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ location: LOCATION, calMax: left.calMax, protein: left.protein, slot, dislikes: m.dislikes }),
      });
      const json = (await res.json().catch(() => null)) as { source?: string; suggestions?: { place: string; order: string; calories: number; protein: number; carbs: number; fat: number; price: number }[] } | null;
      const list = json?.source === "ai" && json.suggestions ? json.suggestions : [];
      setSpots(
        list.map((s, i) => ({
          id: `local:${i}:${s.place}`,
          chainId: "local",
          chain: s.place,
          title: s.order,
          lines: [s.order],
          calories: s.calories,
          protein: s.protein,
          carbs: s.carbs,
          fat: s.fat,
          subtotal: s.price,
          price: Math.round(s.price * 1.0725 * 100) / 100,
          inRange: true,
          source_url: "",
          estimate: true as const,
        })),
      );
      setSpotState(list.length > 0 ? "idle" : "none");
    } catch {
      setSpotState("none");
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Eat out"
      subtitle={`${SLOT_LABEL[slot]}, ${formatDateLong(date)}`}
      footer={
        <Button variant="secondary" size="lg" full onClick={onBack} disabled={!!busy}>
          Back
        </Button>
      }
    >
      <div className="px-1" data-eatout-left>
        <p className="t-label">What&apos;s left today</p>
        <p className="mt-1.5 text-[16px] font-medium tracking-[-0.01em] text-ink">
          {fmt(left.calMax)} kcal, {fmt(left.protein)}g protein
        </p>
        <p className="t-caption mt-1 text-ink-2">After what you logged and your other planned meals.</p>
      </div>

      {orders.length === 0 ? (
        <EmptyState compact title="Nothing fits" body={left.calMax > 0 ? "No chain order fits what is left. Try a swap or a smaller portion." : "The day is full. Cook the smaller portion or skip this meal."} />
      ) : (
        <List className="mt-4" label="Orders">
          {orders.map((o, i) => (
            <OrderRow key={o.id} order={o} first={i === 0} busy={busy === o.id} disabled={!!busy} onTake={() => take(o)} />
          ))}
        </List>
      )}

      {spots.length > 0 ? (
        <>
          <h3 className="t-label mt-6 mb-1">Local spots, estimated</h3>
          <List label="Local spots">
            {spots.map((o) => (
              <OrderRow key={o.id} order={o} first={false} busy={busy === o.id} disabled={!!busy} onTake={() => take(o)} local />
            ))}
          </List>
        </>
      ) : (
        <div className="mt-5">
          <Button variant="secondary" size="md" full loading={spotState === "loading"} onClick={findSpots} disabled={left.calMax <= 0 || !!busy} icon={<MapPin size={18} strokeWidth={1.75} aria-hidden />}>
            Find local spots
          </Button>
          {spotState === "none" ? <p className="t-caption mt-2 px-1 text-ink-2">No local suggestions right now. The chain orders above still work.</p> : null}
        </div>
      )}

      <p className="t-caption mt-5 px-1 text-ink-2">Calories and protein are the chains&apos; published numbers. Prices are estimates with 7.25% sales tax.</p>
    </Sheet>
  );
}

function OrderRow({ order, first, busy, disabled, onTake, local = false }: { order: EatOutOrder; first: boolean; busy: boolean; disabled: boolean; onTake: () => void; local?: boolean }) {
  return (
    <div className="py-4" data-eatout-order>
      <p className="t-label">{order.chain}</p>
      <p className="mt-1.5 text-[15px] text-ink">{order.title}</p>
      <p className={cn("t-sub mt-1.5", order.inRange ? "" : "text-warn")}>
        {fmt(order.calories)} kcal, {fmt(order.protein)}g protein{local ? ", estimate" : ""}
        {order.price > 0 ? (
          <>
            , <Est>{dollars(order.price)}</Est>
          </>
        ) : null}
      </p>
      <div className="mt-3 flex gap-2.5">
        <a
          href={directionsUrl(order.chain)}
          target="_blank"
          rel="noopener noreferrer"
          className="pressable glass inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-[14px] font-medium tracking-[-0.01em] whitespace-nowrap text-ink select-none"
        >
          <MapPin size={16} strokeWidth={1.75} aria-hidden />
          Get directions
        </a>
        <Button full size="sm" variant={first ? "primary" : "solid"} loading={busy} disabled={disabled} onClick={onTake}>
          Eating this
        </Button>
      </div>
    </div>
  );
}
