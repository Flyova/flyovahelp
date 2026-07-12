// Two distinct 0-99 numbers for a pick/guess round. Without the distinctness
// guard, Math.random() occasionally produces the same value twice (e.g. 46 & 46),
// which makes the guesser's pick auto-match the hidden pick every time.
export function generateDistinctNumberPool() {
  const first = Math.floor(Math.random() * 100);
  let second = Math.floor(Math.random() * 100);
  while (second === first) {
    second = Math.floor(Math.random() * 100);
  }
  return [first, second];
}
