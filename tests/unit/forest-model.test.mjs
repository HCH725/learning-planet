import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANIMALS, FOODS, canEat, createForestState, reminderDue } from '../../src/worlds/preschool/forest-model.ts';

test('the slice ships exactly three animals and two foods', () => {
  assert.deepEqual(ANIMALS.map((animal) => animal.id), ['rabbit', 'duck', 'dog']);
  assert.deepEqual(FOODS.map((food) => food.id), ['carrot', 'bread']);
  for (const animal of ANIMALS) assert.ok(animal.name.length > 0);
});

test('each food has at least one animal that eats it', () => {
  for (const food of FOODS) {
    assert.ok(
      ANIMALS.some((animal) => canEat(food.id, animal.id)),
      `${food.id} would be unusable`,
    );
  }
});

test('carrot feeds the rabbit and is rejected by the duck and the dog', () => {
  assert.equal(canEat('carrot', 'rabbit'), true);
  assert.equal(canEat('carrot', 'duck'), false);
  assert.equal(canEat('carrot', 'dog'), false);
});

test('bread feeds the duck and the dog but not the rabbit', () => {
  assert.equal(canEat('bread', 'duck'), true);
  assert.equal(canEat('bread', 'dog'), true);
  assert.equal(canEat('bread', 'rabbit'), false);
});

test('an unknown pair is rejected instead of throwing', () => {
  assert.equal(canEat('pizza', 'rabbit'), false);
  assert.equal(canEat('carrot', 'dragon'), false);
});

test('feeding accumulates per animal and never produces a failure state', () => {
  const forest = createForestState();
  assert.equal(forest.feed('carrot', 'rabbit'), 'eaten');
  assert.equal(forest.feed('carrot', 'rabbit'), 'eaten');
  assert.equal(forest.feed('bread', 'duck'), 'eaten');
  assert.equal(forest.feed('carrot', 'duck'), 'rejected');
  const snapshot = forest.snapshot();
  assert.equal(snapshot.fed.rabbit, 2);
  assert.equal(snapshot.fed.duck, 1);
  assert.equal(snapshot.fed.dog, 0);
  assert.equal(snapshot.rejected, 1);
  assert.equal('error' in snapshot, false, 'a rejected drop is not an error state');
});

test('petting is always allowed and counted', () => {
  const forest = createForestState();
  assert.equal(forest.pet('dog'), true);
  assert.equal(forest.pet('dragon'), false);
  assert.equal(forest.snapshot().pets.dog, 1);
});

test('a break reminder is due only after the configured interval, and 0 disables it', () => {
  assert.equal(reminderDue(0, 20), false);
  assert.equal(reminderDue(19 * 60_000, 20), false);
  assert.equal(reminderDue(20 * 60_000, 20), true);
  assert.equal(reminderDue(999 * 60_000, 0), false);
});
