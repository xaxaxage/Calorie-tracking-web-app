import type { Food, Serving, Unit } from './types';

/**
 * Built-in food list. Values are per 100 g (or 100 ml for drinks) and are
 * typical figures for generic foods, rounded — good enough for everyday
 * tracking. Branded products come from Open Food Facts instead.
 */

type Row = [
  slug: string,
  name: string,
  unit: Unit,
  kcal: number,
  p: number,
  c: number,
  f: number,
  servings: Serving[],
  defaultAmount?: number,
  keywords?: string,
];

const s = (label: string, amount: number): Serving => ({ label, amount });

const ROWS: Row[] = [
  // Breakfast & bakery
  ['oatmeal-milk', 'Oatmeal with milk', 'g', 128, 5.2, 18.5, 3.8, [s('1 bowl', 250)], 250, 'porridge oats'],
  ['oats-rolled', 'Rolled oats, dry', 'g', 379, 13.2, 67.7, 6.5, [s('½ cup', 40)], 40, 'porridge'],
  ['granola', 'Granola', 'g', 471, 10, 64, 20, [s('1 serving', 50)], 50, 'cereal'],
  ['muesli', 'Muesli', 'g', 363, 9.7, 66, 5.9, [s('1 bowl', 45)], 45, 'cereal'],
  ['cornflakes', 'Cornflakes', 'g', 357, 7.5, 84, 0.4, [s('1 bowl', 30)], 30, 'cereal'],
  ['bread-white', 'White bread', 'g', 265, 9, 49, 3.2, [s('1 slice', 30), s('2 slices', 60)], 30, 'toast'],
  ['bread-wholemeal', 'Wholemeal bread', 'g', 247, 13, 41, 3.4, [s('1 slice', 35), s('2 slices', 70)], 35, 'toast wholewheat brown'],
  ['sourdough', 'Sourdough bread', 'g', 272, 10.8, 51.9, 2.4, [s('1 slice', 50)], 50, 'toast'],
  ['bagel', 'Bagel, plain', 'g', 257, 10, 50, 1.6, [s('1 bagel', 100)], 100],
  ['croissant', 'Croissant', 'g', 406, 8.2, 45.8, 21, [s('1 croissant', 60)], 60, 'pastry'],
  ['pancakes', 'Pancakes', 'g', 227, 6.4, 28, 9.7, [s('1 pancake', 50), s('3 pancakes', 150)], 150],
  ['tortilla-wheat', 'Flour tortilla', 'g', 306, 8.2, 50, 7.8, [s('1 tortilla', 45)], 45, 'wrap'],
  ['rice-cakes', 'Rice cakes', 'g', 387, 8.2, 81.5, 2.8, [s('1 cake', 9)], 18],

  // Grains, pasta, potatoes
  ['pasta-wholegrain-cooked', 'Wholegrain pasta, cooked', 'g', 149, 6, 30, 1.7, [s('1 cup', 140)], 180, 'spaghetti penne wholewheat'],
  ['pasta-cooked', 'Pasta, cooked', 'g', 158, 5.8, 30.9, 0.9, [s('1 cup', 140)], 180, 'spaghetti penne macaroni'],
  ['rice-white-cooked', 'White rice, cooked', 'g', 130, 2.7, 28.2, 0.3, [s('1 cup', 158)], 150, 'basmati jasmine'],
  ['rice-brown-cooked', 'Brown rice, cooked', 'g', 123, 2.7, 25.6, 1, [s('1 cup', 195)], 150],
  ['fried-rice', 'Fried rice', 'g', 168, 4.5, 24.8, 5.6, [s('1 portion', 250)], 250],
  ['quinoa-cooked', 'Quinoa, cooked', 'g', 120, 4.4, 21.3, 1.9, [s('1 cup', 185)], 150],
  ['couscous-cooked', 'Couscous, cooked', 'g', 112, 3.8, 23.2, 0.2, [s('1 cup', 157)], 150],
  ['noodles-egg-cooked', 'Egg noodles, cooked', 'g', 138, 4.5, 25, 2.1, [s('1 cup', 160)], 160],
  ['potato-boiled', 'Potatoes, boiled', 'g', 87, 1.9, 20.1, 0.1, [s('1 medium', 150)], 150],
  ['potato-baked', 'Baked potato', 'g', 93, 2.5, 21.2, 0.1, [s('1 medium', 170)], 170, 'jacket'],
  ['sweet-potato-baked', 'Sweet potato, baked', 'g', 90, 2, 20.7, 0.2, [s('1 medium', 150)], 150],
  ['fries', 'French fries', 'g', 312, 3.4, 41, 15, [s('Medium portion', 115)], 115, 'chips'],

  // Meat, fish, eggs, plant protein
  ['chicken-breast-grilled', 'Chicken breast, grilled', 'g', 165, 31, 0, 3.6, [s('1 breast', 170)], 150],
  ['chicken-thigh-roasted', 'Chicken thigh, roasted', 'g', 229, 25, 0, 15, [s('1 thigh', 120)], 120],
  ['chicken-nuggets', 'Chicken nuggets', 'g', 296, 15.8, 16.7, 18.8, [s('6 pieces', 96)], 96],
  ['turkey-breast', 'Turkey breast, roasted', 'g', 135, 30, 0, 1, [s('1 portion', 100)], 100],
  ['beef-mince-cooked', 'Beef mince (10% fat), cooked', 'g', 217, 26, 0, 12.5, [s('1 portion', 125)], 125, 'ground beef'],
  ['steak', 'Beef steak, grilled', 'g', 206, 29, 0, 9.6, [s('1 steak', 200)], 200, 'sirloin'],
  ['pork-chop', 'Pork chop, grilled', 'g', 231, 27.3, 0, 12.8, [s('1 chop', 150)], 150],
  ['bacon', 'Bacon, fried', 'g', 541, 37, 1.4, 42, [s('1 slice', 8), s('3 slices', 24)], 24],
  ['ham', 'Ham, sliced', 'g', 145, 21, 1.5, 6, [s('1 slice', 15)], 30],
  ['sausage-pork', 'Pork sausage, cooked', 'g', 301, 12, 2, 27, [s('1 sausage', 50)], 100],
  ['salmon-baked', 'Salmon, baked', 'g', 206, 22, 0, 12.4, [s('1 fillet', 140)], 140, 'fish'],
  ['tuna-canned', 'Tuna in water, drained', 'g', 116, 25.5, 0, 0.8, [s('1 can', 112)], 112, 'fish'],
  ['cod-baked', 'Cod, baked', 'g', 105, 22.8, 0, 0.9, [s('1 fillet', 150)], 150, 'fish white'],
  ['shrimp-cooked', 'Shrimp, cooked', 'g', 99, 24, 0.2, 0.3, [s('1 portion', 100)], 100, 'prawns'],
  ['egg-boiled', 'Egg, boiled', 'g', 155, 12.6, 1.1, 10.6, [s('1 large egg', 50), s('2 eggs', 100)], 100],
  ['egg-fried', 'Egg, fried', 'g', 196, 13.6, 0.8, 14.8, [s('1 egg', 46), s('2 eggs', 92)], 92],
  ['eggs-scrambled', 'Scrambled eggs', 'g', 149, 10, 1.6, 11, [s('2 eggs', 120)], 120],
  ['omelette', 'Omelette, plain', 'g', 154, 10.6, 0.6, 11.7, [s('2-egg omelette', 120)], 120],
  ['tofu-firm', 'Tofu, firm', 'g', 144, 17.3, 2.8, 8.7, [s('1 portion', 100)], 100],
  ['lentils-cooked', 'Lentils, cooked', 'g', 116, 9, 20, 0.4, [s('1 cup', 198)], 150],
  ['chickpeas-cooked', 'Chickpeas, cooked', 'g', 164, 8.9, 27.4, 2.6, [s('1 cup', 164)], 120, 'garbanzo'],
  ['black-beans-cooked', 'Black beans, cooked', 'g', 132, 8.9, 23.7, 0.5, [s('1 cup', 172)], 120],
  ['baked-beans', 'Baked beans in tomato sauce', 'g', 80, 4.7, 13, 0.4, [s('½ can', 207)], 207],
  ['hummus', 'Hummus', 'g', 166, 7.9, 14.3, 9.6, [s('2 tbsp', 30)], 30],

  // Dairy & alternatives
  ['greek-yogurt-0', 'Greek yogurt 0%', 'g', 59, 10.3, 3.6, 0.4, [s('1 pot', 170)], 200, 'yoghurt fat free'],
  ['greek-yogurt-full', 'Greek yogurt, full fat', 'g', 97, 9, 4, 5, [s('1 pot', 170)], 170, 'yoghurt'],
  ['yogurt-natural', 'Natural yogurt', 'g', 61, 3.5, 4.7, 3.3, [s('1 pot', 150)], 150, 'yoghurt plain'],
  ['skyr', 'Skyr', 'g', 63, 11, 4, 0.2, [s('1 pot', 150)], 150, 'yogurt yoghurt'],
  ['cottage-cheese', 'Cottage cheese', 'g', 98, 11.1, 3.4, 4.3, [s('½ cup', 113)], 113],
  ['cheddar', 'Cheddar cheese', 'g', 403, 24.9, 1.3, 33.1, [s('1 slice', 30)], 30],
  ['mozzarella', 'Mozzarella', 'g', 300, 22.2, 2.2, 22.4, [s('1 ball', 125), s('1 portion', 30)], 30],
  ['feta', 'Feta cheese', 'g', 264, 14.2, 4.1, 21.3, [s('1 portion', 30)], 30],
  ['parmesan', 'Parmesan, grated', 'g', 431, 38, 4.1, 29, [s('1 tbsp', 5)], 10],
  ['cream-cheese', 'Cream cheese', 'g', 342, 6, 4.1, 34, [s('1 tbsp', 15)], 15],
  ['butter', 'Butter', 'g', 717, 0.9, 0.1, 81, [s('1 tsp', 5), s('1 tbsp', 14)], 10],
  ['milk-whole', 'Milk, whole', 'ml', 61, 3.2, 4.8, 3.3, [s('1 glass', 250), s('Splash', 30)], 250],
  ['milk-2', 'Milk, 2%', 'ml', 50, 3.3, 4.8, 2, [s('1 glass', 250), s('Splash', 30)], 250, 'semi skimmed'],
  ['milk-skim', 'Milk, skimmed', 'ml', 34, 3.4, 5, 0.1, [s('1 glass', 250), s('Splash', 30)], 250],
  ['oat-drink-barista', 'Oat drink, barista', 'ml', 59, 1, 6.6, 3, [s('1 glass', 250)], 250, 'oat milk'],
  ['oat-milk', 'Oat milk', 'ml', 46, 1, 6.7, 1.5, [s('1 glass', 250)], 250, 'oat drink'],
  ['almond-milk', 'Almond milk, unsweetened', 'ml', 15, 0.6, 0.3, 1.2, [s('1 glass', 250)], 250],
  ['soy-milk', 'Soy milk, unsweetened', 'ml', 33, 3.3, 0.6, 1.8, [s('1 glass', 250)], 250, 'soya'],
  ['whey-protein', 'Whey protein powder', 'g', 400, 78, 8, 6, [s('1 scoop', 30)], 30, 'shake'],

  // Fruit
  ['banana', 'Banana', 'g', 89, 1.1, 22.8, 0.3, [s('1 medium', 118)], 118],
  ['apple', 'Apple', 'g', 52, 0.3, 13.8, 0.2, [s('1 medium', 182)], 182],
  ['orange', 'Orange', 'g', 47, 0.9, 11.8, 0.1, [s('1 medium', 131)], 131],
  ['pear', 'Pear', 'g', 57, 0.4, 15.2, 0.1, [s('1 medium', 178)], 178],
  ['strawberries', 'Strawberries', 'g', 32, 0.7, 7.7, 0.3, [s('1 cup', 150)], 150],
  ['blueberries', 'Blueberries', 'g', 57, 0.7, 14.5, 0.3, [s('1 cup', 148)], 100],
  ['raspberries', 'Raspberries', 'g', 52, 1.2, 11.9, 0.7, [s('1 cup', 123)], 100],
  ['grapes', 'Grapes', 'g', 69, 0.7, 18.1, 0.2, [s('1 cup', 150)], 150],
  ['mango', 'Mango', 'g', 60, 0.8, 15, 0.4, [s('1 cup', 165)], 165],
  ['pineapple', 'Pineapple', 'g', 50, 0.5, 13.1, 0.1, [s('1 cup', 165)], 165],
  ['watermelon', 'Watermelon', 'g', 30, 0.6, 7.6, 0.2, [s('1 wedge', 280)], 280],
  ['kiwi', 'Kiwi', 'g', 61, 1.1, 14.7, 0.5, [s('1 kiwi', 75)], 75],
  ['avocado', 'Avocado', 'g', 160, 2, 8.5, 14.7, [s('½ avocado', 75)], 75],
  ['dates', 'Medjool dates', 'g', 277, 1.8, 75, 0.2, [s('1 date', 24)], 48],
  ['raisins', 'Raisins', 'g', 299, 3.1, 79, 0.5, [s('1 small box', 14)], 30],

  // Vegetables
  ['broccoli-steamed', 'Broccoli, steamed', 'g', 35, 2.4, 7, 0.4, [s('1 cup', 156)], 80],
  ['carrot', 'Carrot', 'g', 41, 0.9, 9.6, 0.2, [s('1 medium', 61)], 61],
  ['tomato', 'Tomato', 'g', 18, 0.9, 3.9, 0.2, [s('1 medium', 123)], 123],
  ['cucumber', 'Cucumber', 'g', 15, 0.7, 3.6, 0.1, [s('½ cucumber', 150)], 100],
  ['salad-leaves', 'Mixed salad leaves', 'g', 17, 1.4, 3.3, 0.2, [s('1 bowl', 50)], 50, 'lettuce greens'],
  ['spinach', 'Spinach, raw', 'g', 23, 2.9, 3.6, 0.4, [s('1 cup', 30)], 30],
  ['bell-pepper', 'Bell pepper', 'g', 31, 1, 6, 0.3, [s('1 medium', 120)], 120, 'capsicum paprika'],
  ['onion', 'Onion', 'g', 40, 1.1, 9.3, 0.1, [s('1 medium', 110)], 110],
  ['mushrooms', 'Mushrooms', 'g', 22, 3.1, 3.3, 0.3, [s('1 cup', 70)], 70],
  ['green-beans', 'Green beans, cooked', 'g', 35, 1.9, 7.9, 0.3, [s('1 cup', 125)], 125],
  ['peas', 'Peas, cooked', 'g', 84, 5.4, 15.6, 0.2, [s('½ cup', 80)], 80],
  ['sweetcorn', 'Sweetcorn', 'g', 96, 3.4, 21, 1.5, [s('½ cup', 80)], 80, 'corn'],
  ['zucchini', 'Zucchini', 'g', 17, 1.2, 3.1, 0.3, [s('1 medium', 200)], 200, 'courgette'],
  ['cauliflower', 'Cauliflower', 'g', 25, 1.9, 5, 0.3, [s('1 cup', 107)], 107],

  // Nuts, spreads, oils, sweets, snacks
  ['almonds', 'Almonds', 'g', 579, 21.2, 21.6, 49.9, [s('1 handful', 30)], 30, 'nuts'],
  ['walnuts', 'Walnuts', 'g', 654, 15.2, 13.7, 65.2, [s('1 handful', 30)], 30, 'nuts'],
  ['cashews', 'Cashews', 'g', 553, 18.2, 30.2, 43.9, [s('1 handful', 30)], 30, 'nuts'],
  ['peanuts', 'Peanuts', 'g', 567, 25.8, 16.1, 49.2, [s('1 handful', 30)], 30, 'nuts'],
  ['chia-seeds', 'Chia seeds', 'g', 486, 16.5, 42.1, 30.7, [s('1 tbsp', 12)], 12],
  ['peanut-butter', 'Peanut butter', 'g', 588, 25, 20, 50, [s('1 tbsp', 16)], 16],
  ['hazelnut-spread', 'Chocolate hazelnut spread', 'g', 539, 6.3, 57.5, 30.9, [s('1 tbsp', 19)], 19, 'nutella'],
  ['honey', 'Honey', 'g', 304, 0.3, 82.4, 0, [s('1 tsp', 7), s('1 tbsp', 21)], 7],
  ['jam', 'Jam', 'g', 278, 0.4, 68.9, 0.1, [s('1 tbsp', 20)], 20, 'jelly preserve'],
  ['sugar', 'Sugar', 'g', 387, 0, 100, 0, [s('1 tsp', 4)], 4],
  ['olive-oil', 'Olive oil', 'g', 884, 0, 0, 100, [s('1 tsp', 5), s('1 tbsp', 14)], 14],
  ['mayonnaise', 'Mayonnaise', 'g', 680, 1, 0.6, 75, [s('1 tbsp', 14)], 14, 'mayo'],
  ['ketchup', 'Ketchup', 'g', 101, 1, 27.4, 0.1, [s('1 tbsp', 17)], 17],
  ['dark-chocolate', 'Dark chocolate 70%', 'g', 598, 7.8, 45.9, 42.6, [s('2 squares', 20)], 20],
  ['milk-chocolate', 'Milk chocolate', 'g', 535, 7.7, 59.4, 29.7, [s('1 bar', 45)], 45],
  ['crisps', 'Potato chips', 'g', 536, 7, 53, 35, [s('1 small bag', 30)], 30, 'crisps'],
  ['popcorn', 'Popcorn, plain', 'g', 387, 12.9, 77.8, 4.5, [s('1 portion', 25)], 25],
  ['cookie', 'Chocolate chip cookie', 'g', 488, 5.4, 64, 24, [s('1 cookie', 16)], 32, 'biscuit'],
  ['protein-bar', 'Protein bar', 'g', 350, 30, 35, 10, [s('1 bar', 60)], 60],

  // Dishes
  ['chicken-rice-bowl', 'Chicken & rice bowl', 'g', 135.5, 9.5, 16, 3.5, [s('1 bowl', 450)], 450],
  ['pizza', 'Pizza, cheese', 'g', 266, 11.4, 33.3, 9.7, [s('1 slice', 110), s('½ pizza', 330)], 220, 'margherita'],
  ['cheeseburger', 'Cheeseburger', 'g', 263, 13.5, 26, 11.8, [s('1 burger', 115)], 115, 'hamburger'],
  ['lasagna', 'Lasagna', 'g', 150, 8.4, 13, 7, [s('1 portion', 250)], 250, 'lasagne'],
  ['spaghetti-bolognese', 'Spaghetti bolognese', 'g', 132, 7, 15, 4.5, [s('1 plate', 350)], 350],
  ['chicken-curry', 'Chicken curry', 'g', 145, 12, 5, 8.5, [s('1 portion', 300)], 300],
  ['caesar-salad', 'Chicken caesar salad', 'g', 147, 10, 5, 10, [s('1 bowl', 300)], 300],
  ['sushi', 'Sushi rolls', 'g', 140, 5, 25, 2.5, [s('1 piece', 30), s('8 pieces', 240)], 240, 'maki'],
  ['burrito', 'Chicken burrito', 'g', 180, 9.5, 21, 6.5, [s('1 burrito', 350)], 350],
  ['sandwich-ham-cheese', 'Ham & cheese sandwich', 'g', 250, 14, 25, 10, [s('1 sandwich', 150)], 150],
  ['vegetable-soup', 'Vegetable soup', 'g', 35, 1.2, 6, 0.8, [s('1 bowl', 300)], 300],

  // Drinks
  ['coffee', 'Coffee, black', 'ml', 2, 0.3, 0, 0, [s('1 cup', 240)], 240, 'espresso americano'],
  ['latte', 'Caffè latte', 'ml', 42, 2.8, 4.1, 1.6, [s('Regular', 350)], 350, 'coffee'],
  ['cappuccino', 'Cappuccino', 'ml', 38, 2.1, 3.1, 1.9, [s('1 cup', 240)], 240, 'coffee'],
  ['tea', 'Tea, no milk', 'ml', 1, 0, 0.3, 0, [s('1 mug', 250)], 250],
  ['orange-juice', 'Orange juice', 'ml', 45, 0.7, 10.4, 0.2, [s('1 glass', 250)], 250],
  ['smoothie', 'Fruit smoothie', 'ml', 55, 0.6, 13, 0.2, [s('1 bottle', 250)], 250],
  ['cola', 'Cola', 'ml', 42, 0, 10.6, 0, [s('1 can', 330)], 330, 'soda coke'],
  ['beer', 'Beer', 'ml', 43, 0.5, 3.6, 0, [s('1 bottle', 330), s('1 pint', 500)], 330, 'lager'],
  ['wine-red', 'Red wine', 'ml', 85, 0.1, 2.6, 0, [s('1 glass', 150)], 150],
  ['wine-white', 'White wine', 'ml', 82, 0.1, 2.6, 0, [s('1 glass', 150)], 150],
];

export const FOODS: Food[] = ROWS.map(([slug, name, unit, kcal, p, c, f, servings, defaultAmount]) => ({
  id: `db:${slug}`,
  name,
  unit,
  per100: { kcal, p, c, f },
  servings,
  defaultAmount: defaultAmount ?? servings[0]?.amount ?? 100,
}));

const KEYWORDS = new Map(ROWS.map((r) => [`db:${r[0]}`, (r[9] ?? '').toLowerCase()]));

const byId = new Map(FOODS.map((f) => [f.id, f]));

export function builtinFood(id: string): Food | undefined {
  return byId.get(id);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

/** Score how well a food matches a query; 0 means no match. */
export function matchScore(food: Food, query: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const name = normalize(`${food.name} ${food.brand ?? ''}`);
  const haystack = `${name} ${KEYWORDS.get(food.id) ?? ''}`;
  const tokens = q.split(' ');
  if (!tokens.every((t) => haystack.includes(t))) return 0;
  let score = 1;
  if (name.startsWith(q)) score += 3;
  else if (name.split(' ').some((w) => w.startsWith(tokens[0]))) score += 2;
  // Prefer shorter, more generic names.
  score += 1 / (1 + name.length / 20);
  return score;
}

export function searchFoods(foods: Food[], query: string, limit = 20): Food[] {
  return foods
    .map((food) => ({ food, score: matchScore(food, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.food);
}
