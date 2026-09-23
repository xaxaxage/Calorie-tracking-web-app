import { useEffect, useState } from 'preact/hooks';
import { getEntry, findFood, getSaveError, useData } from './lib/store';
import { toastNavigated } from './lib/toast';
import { isDateKey, todayKey } from './lib/dates';
import { mealForTime, parseMeal } from './lib/meals';
import { goBack, useRoute } from './lib/router';
import { ToastHost } from './components/Common';
import { Today } from './screens/Today';
import { History } from './screens/History';
import { AddFood } from './screens/AddFood';
import { FoodDetail } from './screens/FoodDetail';
import { QuickAdd } from './screens/QuickAdd';
import { CopyMeal } from './screens/CopyMeal';
import { MealDetail } from './screens/MealDetail';
import { Scan } from './screens/Scan';
import { Photo } from './screens/Photo';
import { Settings } from './screens/Settings';
import { ChevronLeft } from './components/Icons';

function Missing({ message }: { message: string }) {
  return (
    <main class="screen missing">
      <header class="topbar">
        <button type="button" class="icon-btn ink" aria-label="Back" onClick={() => goBack('/')}>
          <ChevronLeft />
        </button>
        <span class="spacer-44" />
      </header>
      <div class="notice plain">
        <span>
          {message} <a href="#/">Go to Today</a>
        </span>
      </div>
    </main>
  );
}

export function App() {
  const route = useRoute();
  useData();
  const saveError = getSaveError();
  useEffect(() => toastNavigated(), [route.path]);

  // An app left open overnight should move on to the new day when it comes back.
  const [, setWake] = useState(0);
  useEffect(() => {
    const wake = () => document.visibilityState === 'visible' && setWake((n) => n + 1);
    document.addEventListener('visibilitychange', wake);
    return () => document.removeEventListener('visibilitychange', wake);
  }, []);
  const today = todayKey();
  const { segments, query } = route;

  const rawDate = query.get('date');
  const date = isDateKey(rawDate) && rawDate <= today ? rawDate : today;
  const meal = parseMeal(query.get('meal')) ?? mealForTime();

  let screen;
  let withNav = false;
  switch (segments[0] ?? '') {
    case '':
      screen = <Today date={date} />;
      withNav = true;
      break;
    case 'history': {
      const end = query.get('end');
      screen = <History end={isDateKey(end) && end < today ? end : today} />;
      withNav = true;
      break;
    }
    case 'add':
      screen = (
        <AddFood
          meal={meal}
          date={date}
          initialQuery={query.get('q') ?? ''}
          initialTab={query.get('tab') === 'favorites' ? 'favorites' : 'recent'}
        />
      );
      break;
    case 'food': {
      const food = segments[1] ? findFood(segments[1]) : undefined;
      const amount = Number(query.get('amount'));
      screen = food ? (
        <FoodDetail food={food} meal={meal} date={date} amount={amount > 0 ? amount : undefined} />
      ) : (
        <Missing message="That food is no longer available." />
      );
      break;
    }
    case 'entry': {
      const entry = segments[1] ? getEntry(segments[1]) : undefined;
      if (!entry) screen = <Missing message="That entry was deleted." />;
      else if (entry.food && entry.amount)
        screen = <FoodDetail food={entry.food} meal={entry.meal} date={entry.date} entry={entry} />;
      else screen = <QuickAdd meal={entry.meal} date={entry.date} entry={entry} />;
      break;
    }
    case 'quick':
      screen = <QuickAdd meal={meal} date={date} />;
      break;
    case 'copy':
      screen = <CopyMeal meal={meal} date={date} />;
      break;
    case 'meal': {
      const m = parseMeal(segments[1]);
      screen = m ? <MealDetail meal={m} date={date} /> : <Missing message="Page not found." />;
      break;
    }
    case 'scan':
      screen = <Scan meal={meal} date={date} />;
      break;
    case 'photo':
      screen = <Photo meal={meal} date={date} />;
      break;
    case 'settings':
      screen = <Settings />;
      break;
    default:
      screen = <Missing message="Page not found." />;
  }

  return (
    <>
      <div key={route.path} class="screen-host">
        {screen}
      </div>
      {saveError && (
        <div class="save-error" role="alert">
          {saveError}
        </div>
      )}
      <ToastHost raised={withNav} />
    </>
  );
}
