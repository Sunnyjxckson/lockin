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
| Workout | Daily, yes/no | Lift on Mon, Tue, Thu, Fri. Cardio Wed (basketball about 1 hour, or 30 to 60 min Peloton). Jump rope Sat (3 rounds of 10 min). Rest Sun (or 10 min easy rope) |
| Core | Daily, yes/no | 2 moves a day from a rotation of 3 (eGym ab machine, hanging knee raises, reverse crunches). Optional on Sunday |
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

**21. Library**

A reader for a library of real quotes from the Stoics, the pessimists and writers near them. The goal is to finish it, like a book, with a counter showing how far in you are. It is its own tab. (20, Philosophy drops, is the notification feature that pulls from it, below.)

- Every quote is real and traced to a source text: the work, the place in it, the translator and a link to the text
- Reading: one quote fills the screen, swipe for the next. Under it the writer, the source and a plain words line
- Go deeper: the passage around the quote with the quote picked out, who the writer was and a note on the work
- Read them all: quotes read out of the total, overall, per writer and per work. Finishing a writer, the whole library or a round number is a moment of its own
- No repeats until you finish: a first pass shows only quotes not read yet. When a way in runs out, a second pass starts and says so
- Ways in: one writer straight through, one theme, a shuffle across everyone that keeps its order, or Continue where you left off
- Rough day: pick how you feel (overwhelmed, angry, broke, alone, doubting, tempted, tired, afraid) and get quotes matched to it. Today has a quiet "Rough day" row that opens the same picker
- Save a quote in one tap and add a note on why it hit. Saved is your collection, newest first
- Search by word, writer, work or theme
- Stored per quote: read or not, saved or not, your note. The quotes themselves ship with the app as static files
- The 48 Laws style entries show the law, who it is credited to and a link to the source, with the origin note under Go deeper
- The coach may quote a Library line when it fits what you said (never in a safety reply), preferring ones you saved, then unread ones. The message links to that quote
- Optional daily habit "Read N quotes" (default 10, off until turned on in Settings, Checklist). It is an ordinary checklist number item, so targets, streaks and day locking all apply

**20. Philosophy drops**

A short quote as a notification, a few times a day.

- Setting in Settings, Reminders: on or off and how many a day (1 to 6, default 3). Off by default
- Spread evenly between wake and bed, never in quiet hours
- Each drop is a quote you have not read, chosen by date and slot, so the server and the app agree and a drop is never sent twice
- Title is the writer, body is the quote trimmed at a word, a tap opens it in the Library reader
- Works with no accounts at all: the in-app scheduler shows the same drops

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
- Workout logging per exercise: weight and reps for each set, with last session shown beside it. With no history a set starts at the plan's working weight. When the last session hit the top of the rep range on every set, the first set starts 5 lb higher and the logger says "Up 5 lb today"

**9. Coach**

The coach is part coach, part therapist: someone in your corner who keeps you going. It knows you and your numbers, listens when you are low, pushes when you are making excuses, and notices you slipping before you say anything.

Two modes, it reads which one you need

- Push: you are tired, sore, or bargaining. One reframe, then one thing to do right now
- Support: you are down, stressed, ashamed, or stuck. It slows down, asks what is going on, and listens before it coaches. No quotes until it gets what is actually happening
- If it cannot tell, it asks: "you want a push or you want to talk?"

Messaging it

- Open the chat from any tab and say what is wrong: legs are dead, want to smoke, do not feel like delivering, rough day
- Push replies stay two or three lines. Support replies can run longer and ask questions
- It knows the data, so it is specific, for example "You have hit 4 workout days straight. Soreness is the receipt." No lectures, and it does not repeat the same line twice in a week
- It remembers the conversation, so a check-in tonight can pick up what you said this morning

How it helps like a therapist would

- Asks open questions and reflects back what you said before giving advice
- Catches the thought behind a slip, like "I already messed up today so it doesn't matter", and helps you see it differently
- Uses your own reasons: asks why this matters to you, then plays your answers back later instead of preaching
- Cravings: walks you through riding out an urge, which peaks and passes, with something to do in the meantime
- Looks under the slip: sleep, stress, food, being alone, money pressure, and connects them across days
- No shame after a slip. It names it, gives a reset plan for the next 24 hours, and moves on. One bad day is data, not a verdict
- Notices wins too, not just misses

Long memory

- Keeps a running profile on you: your why, what sets off slips, what has actually gotten you moving, what you are working on, things you said that mattered
- You can see and edit it, on the coach notes page
- It reads the profile before every reply

Holds you to things

- When you say you will do something ("lifting at 6:30", "studying after class"), it saves it as a commitment and checks back after it is due, in the chat, with two taps (did it, missed it) or just a reply
- It knows the current schedule block and talks to that

Tone

- Three voices to pick from: calm stoic (the default), drill sergeant, big brother
- Warm in support mode, hard on excuses in push mode, never insulting

What it draws from (push mode)

- Stoics (Marcus Aurelius, Epictetus, Seneca): you do not control the pain, you control your read on it. "We suffer more often in imagination than in reality."
- The second arrow: the pain is the first arrow, complaining about it is the second one you shoot yourself. "Pain is inevitable. Suffering is optional."
- Nietzsche and Frankl: "He who has a why to live for can bear almost any how." The coach points back at your own why and your mood boards
- Athlete mindset (Kobe, Goggins, Ali): when you think you are done you are at about 40 percent. Ali only started counting when it hurt
- Musashi and samurai discipline: do the thing today whether you feel like it or not
- It quotes only from its own library of lines, word for word, so a quote on screen is never made up

When it reaches out on its own

- A quick mood check-in once or twice a day on Today, one tap plus an optional note, so it can see how mood, sleep, and slips connect
- After a logged slip or missed item: checks in, then gives the reset plan
- After something you said you would do, once it is due
- Drift: no logs for a day, missed items two days running, or mood dropping several days in a row. It reaches out and gets more direct the longer it goes. About mood it stays warm
- Morning brief: today's plan, yesterday's misses, where the money total stands
- A quick "how did it go" after the workout block
- Sunday review written from the week's data: what held, what slipped, one change for next week
- Flags patterns, for example lifts dropping two weeks in a row or protein under target three days running

Guardrails

- Soreness vs injury handling stays as is. It tells soreness from injury. Sharp, joint, or one sided pain gets "stop and get it checked", not a quote
- It never says to eat under the calorie target, skip a meal or cut sleep
- It is not a licensed therapist and says so if asked. If the same struggles keep coming back for weeks, it suggests talking to a real therapist
- If a message sounds like a crisis or self-harm, tough talk stops completely: calm, and points to a real person right now: call or text 988, or someone you trust. If you are in danger right now, call 911

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
- Coach: pick the voice, and turn each of its check-ins on or off (after the workout, a slip, a missed item, something you said you would do, and when you drift). See and edit what it remembers about you
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
| Workout + core | 6:30 to 7:30 (Mon lift, Wed cardio) | 6:30 to 7:30 lift | 6:30 to 7:30 lift | Sat jump rope + core, Sun rest or easy rope + core |
| Home, shower, eat | 7:30 to 9:00 | 7:30 to 9:30 | 7:30 to 9:00 | After workout |
| Class | Ends 4:00 | 10:00 to 2:30 | To confirm | None |
| Delivery | Lunch 11:00 to 2:00 if class allows, else after basketball | Dinner 5:00 to 9:00 | Lunch and dinner | Lunch, dinner, late night Fri and Sat |
| Basketball | 5:00 to 7:00 | Optional after class | Optional | Optional |
| Study, homework, business | 8:00 to 11:00, pick one or two | 9:00 to 11:00 | Evening | Longest block of the week |
| Bed | 11:00 | 11:00 | 11:00 | 11:00 |

Lifting days: Mon upper A, Tue lower, Thu upper B, Fri lower. The exercises for each day and the core rotation are stored as seed data so Today can show them. Each exercise can carry a working weight and a short note (kept in the workout's exercises field).

- Mon, Upper A: incline DB press 3 x 8 to 10 (40s, try 45s), lat pulldown 3 x 10 (200), seated cable row 3 x 10 (100), lateral raises 3 x 12 to 15 (7.5 lb), face pulls 3 x 15 (45)
- Tue and Fri, Lower: box jumps 3 x 5 (35 inch box, step down), RDL 3 x 8 (55s), Bulgarian split squats 3 x 10 each leg (35s), leg curl 2 x 12, calf raises 3 x 15 (light)
- Wed, Cardio: basketball about 1 hour, or 30 to 60 min on the Peloton
- Thu, Upper B: pull-ups 3 x 6 to 10 (assisted if under 6), eGym shoulder press 3 x 10 (light), push-ups 3 x close to failure, lateral raises 3 x 12 to 15 (7.5 lb), face pulls 3 x 15 (45)
- Sat, Jump rope: 3 rounds of 10 min with 2 min rest between, basketball optional
- Sun, Rest: full rest, or 10 min easy jump rope
- Core, 2 moves a day in a different pair each day: eGym ab machine 3 x 12 to 15, hanging knee raises 3 x 10 to 12, reverse crunches 3 x 15

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
7. Coach: chat with data context, push and support modes, memory, commitments, mood check-in, drift, the quote library, voices, check-ins, morning brief, Sunday review, pattern flags
8. Polish: animations, haptics, empty states, load speed, install prompt

Days 1 and 2 of the challenge get logged on paper or in Notes, then backfilled once Today ships.

**Open questions**

- [ ] Exact class times for Mon, Wed, and Fri
- [ ] Which days the 9:00 clock-in errand happens
- [ ] Exact credit card minimum and due date, so the money target is the real number and not a ballpark
- [ ] Bedtime: 11:00 with a 5:45 wake is under 7 hours on a cut. Move bed to 10:30, or accept it?
- [ ] Does a partial day count toward the 30, or only full days?
- [ ] Are class times already in Google Calendar, or do they need to be imported from the school system first?
