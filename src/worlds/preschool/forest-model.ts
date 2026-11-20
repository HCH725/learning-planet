/** Pure animal-forest rules. DOM-free so the feed matrix is unit-testable. */
export type AnimalId = 'rabbit' | 'duck' | 'dog';
export type FoodId = 'carrot' | 'bread';

export type Animal = { id: AnimalId; name: string; eats: FoodId[] };
export type Food = { id: FoodId; name: string };

export const ANIMALS: Animal[] = [
  { id: 'rabbit', name: '兔子', eats: ['carrot'] },
  { id: 'duck', name: '小鴨', eats: ['bread'] },
  { id: 'dog', name: '小狗', eats: ['bread'] },
];

export const FOODS: Food[] = [
  { id: 'carrot', name: '紅蘿蔔' },
  { id: 'bread', name: '麵包' },
];

export function canEat(foodId: string, animalId: string): boolean {
  const animal = ANIMALS.find((entry) => entry.id === animalId);
  if (!animal) return false;
  if (!FOODS.some((food) => food.id === foodId)) return false;
  return animal.eats.includes(foodId as FoodId);
}

export type ForestSnapshot = {
  fed: Record<AnimalId, number>;
  pets: Record<AnimalId, number>;
  rejected: number;
};

export type ForestState = {
  feed(foodId: string, animalId: string): 'eaten' | 'rejected';
  pet(animalId: string): boolean;
  snapshot(): ForestSnapshot;
};

export function createForestState(): ForestState {
  const fed: Record<AnimalId, number> = { rabbit: 0, duck: 0, dog: 0 };
  const pets: Record<AnimalId, number> = { rabbit: 0, duck: 0, dog: 0 };
  let rejected = 0;

  return {
    feed(foodId, animalId) {
      if (!canEat(foodId, animalId)) {
        // A wrong drop is information, not a failure: no score, no error state.
        rejected += 1;
        return 'rejected';
      }
      fed[animalId as AnimalId] += 1;
      return 'eaten';
    },
    pet(animalId) {
      if (!ANIMALS.some((animal) => animal.id === animalId)) return false;
      pets[animalId as AnimalId] += 1;
      return true;
    },
    snapshot() {
      return { fed: { ...fed }, pets: { ...pets }, rejected };
    },
  };
}

/** Gentle break reminder: due only after the interval, and 0 turns it off. */
export function reminderDue(elapsedMs: number, minutes: number): boolean {
  if (!Number.isFinite(minutes) || minutes <= 0) return false;
  return elapsedMs >= minutes * 60_000;
}
