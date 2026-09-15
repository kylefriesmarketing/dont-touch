// Wall-clock scheduling lives outside Sim. A large fast-forward request may
// take longer in real time, but it always executes the same ordered sim ticks.
export function advanceSimulation(sim, pending, delta, speed, tickHz, now = () => performance.now()) {
  const step = 1 / tickHz;
  pending = Math.min(.5, pending + Math.max(0, delta) * speed);
  const start = now();
  let steps = 0;
  while (pending + 1e-10 >= step && steps < 600) {
    sim.step(); pending = Math.max(0, pending - step); steps++;
    if (now() - start >= 8) break;
  }
  return { pending, steps, limited: pending + 1e-10 >= step };
}
