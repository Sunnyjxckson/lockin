# Lock In PRD

Oct 5, 2026 · @Sunny

## Overview

Lock In is a mobile-first web app for staying consistent in life, not just a 30 day challenge. The default is ongoing: you use it for the long run, and a slip, like ice cream today, does not reset anything, you just keep going. Challenge mode is an optional layer on top for a set run with its own rules, like 30 days of a strict diet. The first use of it is a personal 30 day lock-in starting Oct 5, 2026.

It answers three questions every time it opens: what am I supposed to be doing right now, what is left today, and am I on track for the 30 days. It replaces spontaneous days with a fixed schedule and tracks body, money, sobriety, school, and business in one place.

## Goals and non-goals

This is a full build: polished, fast, and good enough to show people, not a throwaway tracker.

**Goals**

- Check off the day in under 30 seconds from a phone
- Show the current schedule block and the next one, synced with the real calendar
- Track money toward $1,000 by Oct 14 with a $100 daily floor
- Track weight, meals, calories, full macros (protein, carbs, fat), and progress photos
- Show streaks and a 30 day grid so a missed item is visible, not hidden
- Push reminders at the moments that matter: wake, workout, delivery block, end of day check-in
- A coach you can message any time that knows the data, talks you through the hard moments, and says what is slipping and what to change
- Design that feels like a product: dark, clean, big type, smooth motion

**Out of scope**

- Other users, friends, or leaderboards (the data model leaves room for them later)
- Direct income sync from DoorDash, Uber Eats, or Instacart, since none of them offer it. Earnings come in by quick add or by screenshot

## The daily checklist

A day counts as locked in when every daily item is done. Weekly items roll up on Sunday.

| Item | Type | Done when |
| --- | --- | --- |
| Up by 5:45 | Daily, yes/no | Checked before 6:00 |
| Workout | Daily, yes/no | Lift on Mon, Tue, Thu, Fri. Light basketball Wed. Jump rope Sat (15 to 20 min) and Sun (10 min) |
| Core | Daily, yes/no | 5 to 10 min, rotation for that day |
| Calories | Daily, number | 1,900 to 2,100 |
| Protein | Daily, number | 180g or more |
| Earned today | Daily, number | $100 or more |
| No smoking | Daily, yes/no | Checked at end of day |
| No drinking | Daily, yes/no | Checked at end of day |
| No masturbation | Daily, yes/no | Checked at end of day |
| Study or homework block | Daily, yes/no | Scheduled block completed |
| Business move | Daily, text + yes/no | One concrete action logged (school deal, cohort, investor, client) |
| In bed on time | Daily, yes/no | Checked next morning |
| Talk to one girl at school | Weekly, yes/no | Once per week |
| Weigh-in and photo | Weekly, number + image | Friday morning |

A missed item does not reset the challenge. The day shows as partial and the streak for that one item resets.

## Core features

Five main screens with Today as home, plus calendar sync, reminders, a coach, and a design system that run across all of them.

**1. Today**

- Header: Day X of 30, today's date, percent of checklist done
- Now and Next: the current schedule block and the one after it
- The checklist from the section above, tap to complete, number fields inline
- Today's workout shown in full (exercises, sets, reps) plus the core rotation for the day

**2. Schedule**

- Day view of time blocks built from the template for that weekday, each showing its start and end time
- Add anything to the day by name and length, for example TV for 1 hour. The app drops it into the next open slot and shows the exact time, or you pick the time yourself
- Free time is planned like everything else: TV, games, and scrolling get a block with a set length, and a timer runs while the block is live
- Blocks can be dragged, resized, or edited for that day only without changing the template
- If one block runs long, the flexible blocks after it shift and the new times show right away
- A toggle for the 9:00 clock-in errand, which shifts the morning blocks

## Lock In is about life, not just weight

The body is one track. The point is locking in with life: the brand, the degree, the money, the person you are becoming. The app treats all of it as one push.

**14. Mood board**

Built for a designer. The way a fashion house sets its world before any clothes exist, like Rick Owens or Balenciaga, you set the world you are locking in toward.

- Build a board of images, colors, and references: the physique, the brand direction, the life
- Add images from the camera, the web, or screenshots, and pull a color palette from any image
- It is the visual version of the why. When motivation dips, you see the whole world you are building toward, not just a quote
- More than one board, for example a body board and a brand board

**15. The board sets the app's look**

- The palette you pull from a board becomes the app's theme: colors, accent, the whole vibe
- A few base themes to start, for example dark minimal or high contrast, then yours on top
- It stops feeling like a generic tracker and starts feeling like your world. For a designer that is the difference between using it and living in it

**16. Meal planning on a budget**

Closes the food loop: goal to plan to grocery list to cooking, all inside a set budget.

- Put in a weekly food budget, the calorie and macro targets, and food likes and dislikes
- It builds a week of meals from a recipe library, each with ingredients, macros, and cost, and keeps the week under budget with the running total shown as it plans
- Swap any meal and it rebalances cost and macros
- Grocery list: the week rolled into one list with combined quantities. It prices the same list across stores (Food Lion, Harris Teeter, Aldi, Walmart, Publix) so you see where the week is cheapest, like $85 at one store but $60 at Aldi, then go there or push the list to Instacart to order in one tap
- Each meal keeps its recipe and exact portions to hit the numbers
- Ties into the Money screen, since groceries are a real expense during the 30 days

Build note: live store prices are the hard part, so v1 uses estimated prices and gets exact once an Instacart or store integration is wired. Portion and macro math works from day one.

**17. Ongoing vs challenge mode**

- Default is ongoing, used for the long run. A slip does not reset anything, the point is consistency over time
- Challenge mode is an optional layer with a duration and its own rules, for example 30 days of a set diet or a set routine
- A challenge can end, succeed, or be restarted without touching the ongoing history underneath

**18. Study and focus timer**

- Log study hours, or hit start and a focus timer runs
- Focus mode locks the phone into study so there is no slipping into TikTok or social while the clock runs
- Same timer idea as the scheduled free-time blocks, pointed at deep work
- Feeds the daily checklist and the coach

**19. Finances via the other app**

- Money and business do not get rebuilt here. They integrate from the separate finance app already being built to track money and pay off debt
- Lock In keeps the simple $100 a day earnings floor for the challenge, the deeper money tracking lives in the finance app and feeds in
- Business stays light: a goal-driven log, not a full build

**3. Money**

- Running total toward $1,000 at the top, with days left until Oct 14
- Today's earnings against the $100 floor. The floor stays $100 even when ahead
- Quick add: amount, app (DoorDash, Uber Eats, Instacart), hours worked
- Shows surplus banked and effective hourly rate
- After Oct 14 the target can be reset to a new number and date

**4. Body**

- Weekly weight entry with a simple line over the 30 days
- Calories, protein, carbs, and fat per day against targets, shown as rings that fill through the day, with what is left to eat
- Progress photos side by side: day 1 against the latest

**5. Progress**

- 30 day grid: full, partial, or missed for each day
- Current streak per item
- Weekly review on Sunday: what slipped and one change for next week

**6. Calendar sync**

- Two-way sync with Google Calendar: class times come in, Lock In blocks go out
- Moving a block in either place updates the other
- Conflicts are flagged on Today, for example a delivery block that overlaps class

**7. Reminders**

- Push notifications for wake, workout, the start of each delivery block, and the end of day check-in
- A nudge at 8:00 pm if earnings are under $100
- Quiet after bedtime

**8. Smart logging**

- Snap a meal and get estimated calories, protein, carbs, and fat, editable before saving. Saved meals can be re-logged in one tap
- Screenshot an earnings screen and the amount, app, and hours fill in on their own
- Workout logging per exercise: weight and reps for each set, with last session shown beside it

**9. Coach**

The coach is a chat, not a report. You message it any time and it answers like a coach who knows your numbers. The briefs are just one thing it sends.

Messaging it

- Open the chat from any tab and say what is wrong: legs are dead, want to smoke, do not feel like delivering
- It answers in two or three lines: one idea that reframes the moment, then one thing to do right now
- It knows the data, so it is specific, for example "You have hit 4 workout days straight. Soreness is the receipt."
- No lectures, no paragraphs, and it does not use the same quote twice in a week
- It remembers the conversation, so a check-in tonight can pick up what you said this morning

What it draws from

- Stoics (Marcus Aurelius, Epictetus, Seneca): you do not control the pain, you control your read on it. "We suffer more often in imagination than in reality."
- The second arrow: the pain is the first arrow, complaining about it is the second one you shoot yourself. "Pain is inevitable. Suffering is optional."
- Nietzsche and Frankl: "He who has a why to live for can bear almost any how." The coach points back at your own why and your mood boards
- Athlete mindset (Kobe, Goggins, Ali): when you think you are done you are at about 40 percent. Ali only started counting when it hurt
- Musashi and samurai discipline: do the thing today whether you feel like it or not
- It quotes only from its own library of lines, word for word, so a quote on screen is never made up

Tone

- Three voices to pick from: calm stoic (the default), drill sergeant, big brother
- Hard on excuses, never insulting

When it reaches out on its own

- Morning brief: today's plan, yesterday's misses, where the money total stands
- A quick "how did it go" after the workout block
- A check-in after a logged slip, asking what set it off, and after a missed item, asking what got in the way
- Sunday review written from the week's data: what held, what slipped, one change for next week
- Flags patterns, for example lifts dropping two weeks in a row or protein under target three days running

Guardrails

- It tells soreness from injury. Sharp, joint, or one sided pain gets "stop and get it checked", not a quote
- It never says to eat under the calorie target, skip a meal or cut sleep
- If a message sounds like more than a bad day, it drops the tough talk and says to reach out to a real person

**10. Design**

- Dark theme, large numbers, one accent color for done states
- Completing an item gives haptic feedback and a short animation. Finishing the full day gets a bigger one
- Shareable progress card: day count, streaks, and before and after photos

**11. Settings**

Nothing is hardcoded. Every number and item in this doc is a starting default.

- Checklist: add, remove, rename, or reorder items, and change any target (wake time, calories, macros, daily floor)
- Schedule: edit the template for any weekday, or change a single day
- Workouts: swap exercises, sets, and reps, and change which days are lift days
- Challenge: start date, length, money target and deadline
- Reminders: turn each one on or off and set its time
- Coach: pick the voice, and turn each of its check-ins on or off
- Changes apply from today forward, so past days keep the targets they were scored against

**12. Vices**

- A library of vices to pick from: smoking, vaping, weed, drinking, gambling and sports betting, porn, masturbation, junk food, fast food, energy drinks, doomscrolling, impulse spending
- Add a custom one in a few taps
- Each vice is either quit completely for the challenge or capped, for example social media under 30 minutes a day
- Each one gets its own clean streak, and a slip is logged with the time and what set it off so the coach can spot the pattern
- Money vices like gambling and impulse spending also show dollars kept
- The starting picks are the three in the checklist above. The rest are off until turned on

## Schedule template

Two fixed rocks hold every day: the 6:30 workout and class. Everything else fills the open time. Class times below are from memory and need to be confirmed against the school calendar.

| Block | Mon / Wed | Tue / Thu | Fri | Sat / Sun |
| --- | --- | --- | --- | --- |
| Wake | 5:45 | 5:45 | 5:45 | 5:45 |
| Workout + core | 6:30 to 7:30 (Mon lift, Wed light basketball) | 6:30 to 7:30 lift | 6:30 to 7:30 lift | Jump rope + core |
| Home, shower, eat | 7:30 to 9:00 | 7:30 to 9:30 | 7:30 to 9:00 | After workout |
| Class | Ends 4:00 | 10:00 to 2:30 | To confirm | None |
| Delivery | Lunch 11:00 to 2:00 if class allows, else after basketball | Dinner 5:00 to 9:00 | Lunch and dinner | Lunch, dinner, late night Fri and Sat |
| Basketball | 5:00 to 7:00 | Optional after class | Optional | Optional |
| Study, homework, business | 8:00 to 11:00, pick one or two | 9:00 to 11:00 | Evening | Longest block of the week |
| Bed | 11:00 | 11:00 | 11:00 | 11:00 |

Lifting days: Mon upper A, Tue lower, Thu upper B, Fri lower. The exercises for each day and the 7 day core rotation are stored as seed data so Today can show them.

## Data model and tech

Mobile-first web app installed to the home screen as a PWA. One user, one passcode, no sign-up flow. Suggested stack: Next.js on Vercel, Supabase for the database, auth, and photo storage, the Google Calendar API for sync, web push for reminders, and the Claude API for the coach and for reading meal and earnings photos.

| Table | Key fields |
| --- | --- |
| challenge | start\_date, length\_days, money\_target, money\_deadline, daily\_floor |
| checklist\_item | name, type (yes/no, number, text), cadence (daily, weekly), target, category (habit, vice), mode (quit, cap) |
| day\_log | date, item\_id, value, completed\_at |
| schedule\_template | weekday, block\_name, start, end |
| schedule\_block | date, block\_name, start, end, duration, flexible, calendar\_event\_id |
| earning | date, amount, app, hours, screenshot\_url |
| meal | date, time, photo\_url, calories, protein, carbs, fat |
| body\_log | date, weight, photo\_url |
| workout | weekday, name, exercises (name, sets, reps) |
| set\_log | date, exercise, set\_number, weight, reps |
| reminder | block\_name or item\_id, offset\_minutes, enabled |
| coach\_note | date, kind (morning, weekly, flag), body |
| coach\_message | date, sent\_at, sender (me, coach), body, trigger (chat, post\_workout, slip, missed\_item), source, quote, check\_key, read |
| mood\_log | date, time, mood, note |
| motivation | kind (quote, clip, why), body, url |
| board | name, kind (body, brand, life) |
| board\_item | board\_id, image\_url, note, color |
| theme | palette, accent, base (dark, contrast), board\_id |
| recipe | name, ingredients, steps, calories, protein, carbs, fat, est\_cost |
| meal\_plan | week\_start, budget, recipe\_ids, total\_cost |
| grocery\_item | plan\_id, name, quantity, store, price, bought |

Rules the app enforces:

- Day number comes from start\_date, never stored
- The daily floor never drops when the running total is ahead
- Streaks are per item, computed from day\_log
- A day can be edited until noon the next day, then it locks

## Build order and open questions

Build it in phases so it is usable from the first one, and each phase adds a layer on top.

1. Foundation: design system, database, passcode, settings, Today screen with the checklist and seeded workouts
2. Money: quick add, running total, floor logic, earnings screenshot reading
3. Schedule: template, per day edits, Google Calendar two-way sync
4. Body: weight, meal photos with calorie and macro estimates, progress photos, per set workout logging
5. Progress: 30 day grid, streaks, shareable card
6. Reminders: push notifications and the 8:00 pm earnings nudge
7. Coach: chat with data context, the quote library, voices, check-ins, morning brief, Sunday review, pattern flags
8. Polish: animations, haptics, empty states, load speed, install prompt

Days 1 and 2 of the challenge get logged on paper or in Notes, then backfilled once Today ships.

**Open questions**

- [ ] Exact class times for Mon, Wed, and Fri
- [ ] Which days the 9:00 clock-in errand happens
- [ ] Exact credit card minimum and due date, so the money target is the real number and not a ballpark
- [ ] Bedtime: 11:00 with a 5:45 wake is under 7 hours on a cut. Move bed to 10:30, or accept it?
- [ ] Does a partial day count toward the 30, or only full days?
- [ ] Are class times already in Google Calendar, or do they need to be imported from the school system first?
