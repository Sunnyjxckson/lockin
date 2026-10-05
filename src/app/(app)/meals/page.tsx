"use client";

// Placeholder. The meals agent fills this in: a week of meals inside a budget,
// swaps, and the grocery list priced across stores (feature 16). The data is
// ready: tables recipe, meal_plan, grocery_item, expense, and the food
// settings on app_settings (weekly_food_budget, food_likes, food_dislikes).

import { UtensilsCrossed } from "lucide-react";
import { EmptyState, PageHeader, Screen } from "@/components/ui";

export default function MealsPage() {
  return (
    <Screen>
      <PageHeader title="Meals" back="/body" />
      <EmptyState
        icon={<UtensilsCrossed size={24} aria-hidden />}
        title="No meal plan yet"
        body="Meal planning is coming: a week of meals that hits your numbers inside a food budget, and one grocery list for it."
      />
    </Screen>
  );
}
