import { H3, H4, P } from './help-primitives';

export default function CourseManagementHelpContent() {
  return (
    <>
      <H3>Course Management</H3>

      <H4>Importing a course</H4>
      <P>{`Courses are imported from KML files via the Admin page. The KML contains GPS coordinates for every tee, pin, target, and center line on each hole. Once imported, each hole gets computed yardages, elevation deltas, compass heading, and plays-like yardages based on elevation difference between tee and green.`}</P>

      <H4>Hazard mapping</H4>
      <P>{`Each hole can have hazards drawn as GPS polygons on a satellite map — fairway bunkers, greenside bunkers, water, out-of-bounds, trees, and rough. Each hazard type has a default stroke penalty applied when a simulated shot lands inside the polygon:`}</P>
      <P>{`  Water / OB — 1.0 stroke
  Greenside bunker — 0.5 stroke
  Trees — 0.5 stroke
  Fairway bunker — 0.3 stroke
  Rough — 0.2 stroke`}</P>
      <P>{`Penalties are configurable from the Admin page. The green is also drawn as a polygon and used to compute the center-green aim point for par 3 strategies.`}</P>

      <H4>Hazard drop logic</H4>
      <P>{`When a simulated shot lands in a hazard, the drop location depends on the hazard type — following real Rules of Golf behavior:

  OB — ball is dropped where it crosses the OB boundary, not deep inside. A binary search (8 iterations) along the shot trajectory finds the entry point, then drops 2 yards back toward the shot origin. The drop is validated to ensure it doesn't land in another hazard.

  Bunkers — ball stays in the bunker. The penalty represents shot difficulty (partial lies, awkward stances), not a re-drop. You play your next shot from where it landed.

  Water — ball is moved 5 yards backward along the shot line. The drop point is validated via safe-drop search to avoid landing in adjacent hazards.

Shots landing outside all fairway, green, and hazard polygons are treated as rough and incur an implicit rough penalty (default 0.3 strokes, configurable via Admin > Hazard Penalties). This ensures the optimizer strongly favors landing on defined fairway polygons.`}</P>

      <H4>Strategy optimizer — Dynamic Programming (MDP)</H4>
      <P>{String.raw`Rather than using hardcoded strategy templates, the optimizer models each hole as a Markov Decision Process (MDP) and solves it with Dynamic Programming. This means it explores every reachable position on the hole, every eligible club you could hit from that position, and every aim direction you might choose — then finds the sequence of decisions that minimizes your expected score.

The key advantage: the optimizer discovers strategies on its own. It doesn't need to be told "hit driver, then 7-iron." It figures out that a 3-wood off the tee followed by a gap wedge scores better than driver-plus-9-iron because the 3-wood avoids the fairway bunker at 260 yards. It also produces conditional strategies — if your tee shot ends up in the rough right instead of the fairway, it already knows the best play from there.

All computation runs server-side, parallelized across multiple worker threads (~2–5 seconds per hole, ~30–60 seconds for 18 holes). The client fetches results via API.`}</P>

      <H4>Step 1: Zone discretization</H4>
      <P>{String.raw`The optimizer breaks each hole into a grid of discrete zones. Starting from the tee, it walks along the hole's center line in 20-yard intervals. At each interval, it creates 3 lateral positions: center (on the center line), left (20 yards left), and right (20 yards right). Each zone records its GPS position, its distance to the pin, and its lie — fairway or rough — determined by checking whether the position falls inside any fairway polygon.

The tee is zone 0. The green is a terminal zone: once the ball lands inside the green polygon (or within 10 yards of the pin if no polygon is defined), the hole is over and only putting remains. A typical hole has ~50 zones.

$$\text{zones} = \{\text{tee}\} \cup \bigcup_{d=20,40,\ldots}^{d_\text{pin}-10} \{\text{center}_d, \text{left}_d, \text{right}_d\} \cup \{\text{green}\}$$

The green zone's value is set to expected putts from 0 yards — the terminal condition for value iteration.

For doglegs without explicit center line data, the optimizer synthesizes one by walking from tee to pin in 20-yard steps, scoring candidate directions across a $\pm$75° fan at each step. Candidates on the fairway score +10, in a hazard score −20, and closer to the pin get a small distance bonus. The resulting center line follows the fairway's natural curve.`}</P>

      <H4>Step 2: Action space</H4>
      <P>{String.raw`From each non-terminal zone, the optimizer enumerates every possible action: a (club, aim bearing) pair.

Eligible clubs are those whose mean carry falls between 50% and 110% of the remaining distance to the pin. This keeps the search space practical — you wouldn't hit driver from 80 yards, and you wouldn't hit a wedge from 280. Typically 5–7 clubs qualify per zone.

Aim bearings are sampled across $\pm$30° from the center line bearing at each zone, with an adaptive step size based on hole distance: 4° for short holes (<180y, 16 bearings), 3° for mid-length holes (180–350y, 21 bearings), and 2° for long holes (350y+, 31 bearings). Using the center line direction instead of the pin bearing naturally aims tee shots down the fairway on doglegs. The fine resolution on longer holes lets the optimizer find narrow fairway windows (e.g., a 9°-wide fairway at 230 yards) that coarser steps would miss.

$$\text{actions}(z) = \{(c, \theta) : c \in \text{eligible}(z),\; \theta \in \{\theta_\text{centerline} - 30°, \ldots, \theta_\text{centerline} + 30°\}\}$$

Total: ~100–220 actions per zone depending on hole length, explored exhaustively.`}</P>

      <H4>Step 3: Transition sampling</H4>
      <P>{String.raw`For each (zone, club, bearing) triple, the optimizer simulates a batch of Gaussian shots to build a probability distribution over where the ball will end up. The sample count adapts to hazard density: 100 samples for safe zones with no nearby hazards, 250 for zones near bunkers, and 350 for zones near OB or water where accuracy matters most.

Each sample draws carry and offline from your measured club distributions:

$$\text{carry} \sim \mathcal{N}(\mu_\text{carry},\; \sigma_\text{carry} \cdot \lambda)$$
$$\text{offline} \sim \mathcal{N}(\mu_\text{offline},\; \sigma_\text{offline} \cdot \lambda)$$

where $\lambda$ is a lie multiplier: $\lambda = 1.0$ from the fairway, $\lambda = 1.15$ from the rough (15% wider dispersion due to uncertain contact).

Each sample is projected to a GPS landing point, checked for tree trajectory collisions (3D flight model vs. canopy polygons), checked for hazard polygon hits (with stroke penalties), and then mapped to the nearest zone. After all samples, the result is a transition probability table:

$$P(z' \mid z, a) = \frac{\text{count of samples landing in zone } z'}{N_\text{samples}}$$

Along with the expected penalty $\mathbb{E}[\text{penalty} \mid z, a]$, penalty variance $\text{Var}[\text{penalty} \mid z, a]$, the probability of reaching the green $P(\text{green} \mid z, a)$, and the probability of landing on the fairway $P(\text{fairway} \mid z, a)$ — used by the lie cascade correction in value iteration.

This transition table is the most expensive step but is built once and shared across all 3 scoring modes. Adaptive bearing and sampling reduce total samples by ~40% on typical courses while concentrating accuracy near hazards.`}</P>

      <H4>Step 4: Value iteration (Bellman equation)</H4>
      <P>{String.raw`With the transition table built, the optimizer solves for the optimal value (expected strokes to finish) at every zone using the Bellman equation. It does this 3 times with different objective functions, producing 3 strategies per hole:

Each mode includes a lie cascade correction $\mathcal{L}$ that accounts for the cascading cost of rough landings. When a ball lands in rough but gets assigned to a fairway zone, that zone's $V$ value is optimistic — it assumes a fairway lie for subsequent shots. The correction compensates:

$$\mathcal{L}(z, a) = \rho \cdot \bigl(1 - P(\text{fairway} \mid z,a) - P(\text{green} \mid z,a)\bigr)$$

where $\rho$ is the rough penalty (default 0.3). This adds ~0.3 strokes for actions where most samples land in rough, on top of the direct penalty already captured in $\mathbb{E}[\text{penalty}]$.

Scoring mode — pure expected strokes minimization:
$$V(z) = \min_a \left[ 1 + \mathbb{E}[\text{penalty}] + \mathcal{L} + \sum_{z'} P(z') \cdot V(z') \right]$$

Safe mode — risk-adjusted, penalizes variance:
$$V(z) = \min_a \left[ 1 + \mathbb{E}[\text{penalty}] + \mathcal{L} + \sum_{z'} P(z') \cdot V(z') + 0.5 \cdot \sigma_\text{penalty} \right]$$

Aggressive mode — rewards reaching the green (birdie hunting):
$$V(z) = \min_a \left[ 1 + \mathbb{E}[\text{penalty}] + \mathcal{L} + \sum_{z'} P(z') \cdot V(z') - 0.3 \cdot P(\text{green}) \right]$$

The $+0.5\sigma$ term in Safe mode means it prefers lower-variance plays even if they cost a fraction of a stroke on average. The $-0.3 \cdot P(\text{green})$ term in Aggressive mode gives a bonus for actions that can reach the green — encouraging go-for-it plays on par 5s and drivable par 4s.

Value iteration starts with $V(z) = \infty$ for all non-terminal zones and $V(\text{green}) = \text{expectedPutts}(0)$. Each iteration updates every zone's value using the Bellman equation above. Convergence is reached when the maximum value change across all zones drops below 0.001, or after 50 iterations (whichever comes first). Typically converges in ~10 iterations.

The optimal policy $\pi^*(z)$ at each zone is the action that achieves the minimum value:
$$\pi^*(z) = \arg\min_a \left[ \text{objective}(z, a) \right]$$`}</P>

      <H4>Step 5: Policy extraction and Monte Carlo scoring</H4>
      <P>{String.raw`Once value iteration converges, the optimizer traces the optimal path from the tee zone by following each mode's policy:

$$z_0 = \text{tee}, \quad z_{k+1} = \text{most likely zone from } P(z' \mid z_k, \pi^*(z_k))$$

This gives the planned club sequence and aim points. But to get accurate score distributions, the optimizer runs 2,000 Monte Carlo trials that follow the policy with conditional zone lookup — the critical advantage over template-based simulation.

In each trial:
  1. Start at the tee zone
  2. Look up the policy's action for the current zone: $a = \pi^*(z_\text{current})$
  3. Sample a random shot from the club's distribution (carry + offline)
  4. Check tree collisions and hazards at the landing point
  5. Find the nearest zone to the landing point
  6. Repeat from step 2 at the new zone
  7. Once on the green, add expected putts

The key difference from the old system: if the ball lands in an unexpected zone (rough right instead of fairway center), the policy already has an optimal action for that zone. The old template system would blindly hit the same second club regardless of where the tee shot ended up. This produces realistic score distributions that account for recovery shots.

After 2,000 trials, the standard error of the expected score is:
$$\text{SE} = \frac{\sigma}{\sqrt{2000}} \approx 0.02 \text{ strokes}$$`}</P>

      <H4>Lateral bias compensation</H4>
      <P>{String.raw`Most golfers have a consistent lateral miss pattern — a draw bias, a fade, or a push. The optimizer compensates for this by shifting aim points opposite to your measured mean offline.

If your driver averages 8 yards right of target ($\mu_\text{offline} = 8$), the optimizer shifts your aim point 8 yards left so that the expected landing zone is centered on the target. The shift is applied perpendicular to the shot bearing:

$$\text{aimPoint} = \text{project}(\text{target}, \text{bearing} + 90°, -\mu_\text{offline})$$

On the map, you see two lines per shot: the white dashed aim line (where to point the club) and the cyan ball flight curve (expected ball path with draw/fade shape). The dispersion ellipses on the map are centered on the landing target (where the ball actually goes), not the aim point.`}</P>

      <H4>Tree trajectory collision</H4>
      <P>{String.raw`During both transition sampling and Monte Carlo trials, each shot's flight arc is checked against tree hazard polygons. The ball's height is sampled at 10-yard intervals along the flight path and compared against the tree canopy height (15 yards). If the ball is below the canopy and inside a tree polygon, it drops at the collision point with a 0.5-stroke penalty.

Ball height uses an asymmetric two-segment flight model when per-club data is available:

Ascent phase ($d < d_\text{apex}$):
$$h(d) = \text{apex} \cdot t \cdot (2 - t), \quad t = \frac{d}{d_\text{apex}}$$

Descent phase ($d \geq d_\text{apex}$):
$$h(d) = \text{apex} \cdot \frac{\text{carry} - d}{\text{carry} - d_\text{apex}}$$

where the apex position is forward-shifted to match real ball flight:
$$d_\text{apex} = \max\!\left(0.3 \cdot \text{carry},\; \text{carry} - \frac{\text{apex}}{\tan(\theta_\text{descent})}\right)$$

If the club has no measured apex or descent angle, it falls back to a symmetric parabola with a 28-yard (84 ft) apex:
$$h(d) = 4 \cdot 28 \cdot \frac{d}{\text{carry}} \cdot \left(1 - \frac{d}{\text{carry}}\right)$$`}</P>

      <H4>Putting model</H4>
      <P>{String.raw`Once on the green (inside the green polygon, or within 10 yards of the pin as fallback), the same log-curve putting model converts distance to expected putts:

$$\text{putts}(d) = 1.0 + 0.42 \cdot \ln(d)$$

If the ball is 10–40 yards out (chip zone), the trial adds 1 chip stroke plus expected putts from 3 yards ($\approx$ 1.46 putts total). This model is used both as the terminal value in value iteration and in the Monte Carlo scoring trials.`}</P>

      <H4>Score distribution</H4>
      <P>{String.raw`Each of the 2,000 Monte Carlo trials produces a total stroke count. These are rounded to integers and categorized relative to par:

$$\text{diff} = \text{round}(\text{totalStrokes}) - \text{par}$$

  $\leq -2$ → Eagle
  $-1$ → Birdie
  $0$ → Par
  $+1$ → Bogey
  $+2$ → Double
  $> +2$ → Worse

These counts are converted to probabilities (e.g., 40% par, 30% bogey) and displayed as a stacked color bar on each strategy card. The blow-up risk badge is shown when $P(\text{double}) + P(\text{worse}) > 5\%$.`}</P>

      <H4>Caddy tips</H4>
      <P>{String.raw`Each shot in the optimal plan gets a natural-language caddy tip describing where to aim and what to watch for. The tip has three components:`}</P>
      <P>{String.raw`1. Aim direction — computed as the angular difference between the direct line to target and the bias-compensated aim line. If the shift is more than 1°, the tip says "Aim left" or "Aim right."

2. Ball movement — describes your expected lateral bias. If $\mu_\text{offline} > 1$, the tip says "works right to the pin" (or "to the fairway" for tee shots).

3. Hazard reference — the tip names the most relevant hazard near the shot path. Hazards are found by searching two zones:
  a. Within 50 yards of the aim point (near the target)
  b. Along the flight corridor — perpendicular distance $\leq$ 35 yards from the shot line, between 20% and 120% of the shot distance

The perpendicular distance to the shot line uses:
$$d_\perp = d_\text{origin} \cdot \sin(\Delta\theta)$$
$$d_\parallel = d_\text{origin} \cdot \cos(\Delta\theta)$$

where $d_\text{origin}$ is the haversine distance from the shot origin to the hazard centroid and $\Delta\theta$ is the bearing difference. Hazards are ranked by $\min(d_\text{aim}, d_\perp)$ — closest to either the aim point or the flight path wins.

Example tip: "Aim left of the right bunker, works right to the pin"`}</P>

      <H4>Carry notes</H4>
      <P>{String.raw`Each shot also gets a carry distance note with context, like "+20y past bunker" or "~5y short of water." The algorithm finds hazards along the shot bearing (within 35°), computes the distance from the origin to the nearest polygon vertex (not centroid — more accurate for long/narrow hazards like tree lines), and reports the clearance:

$$\text{clearance} = \text{carry} - d_\text{hazard}$$

Positive clearance → "+Ny past [hazard]"
Negative clearance → "~Ny short of [hazard]"`}</P>

      <H4>Game Plan</H4>
      <P>{String.raw`The game plan runs the DP optimizer across all 18 holes and produces a complete round strategy. For each hole, all 3 modes are solved and the plan picks the strategy matching the selected mode (Scoring, Safe, or Aggressive). Each hole card shows the club sequence, expected strokes, caddy tips, and a score distribution bar.`}</P>
      <P>{String.raw`The summary shows your expected total score, plays-like yardage, and an aggregate score breakdown. It also identifies "key holes" — the 4 holes where your strategy choice makes the biggest difference. Key holes are computed by comparing the Scoring and Safe mode expected strokes:

$$\text{delta}_h = |xS_\text{scoring} - xS_\text{safe}|$$

The top 4 holes by delta are flagged with a gold KEY badge — these are the holes where playing it safe vs. aggressive costs (or saves) the most strokes. Game plans are cached on the server and auto-regenerate when your practice data changes (new sessions, updated clubs) or when the optimizer code is updated.`}</P>

      <H4>Three scoring modes</H4>
      <P>{String.raw`All three modes share the same transition table and differ only in their objective function during value iteration:

Scoring — minimizes pure expected strokes. This mode finds the mathematically optimal strategy, favoring aggressive plays when the risk-reward is positive. It might tell you to go for a par 5 in two even if there's water in front of the green, because the strokes saved on successful attempts outweigh the penalty on misses.

Safe — adds a $+0.5\sigma$ variance penalty. This mode prefers consistent plays over volatile ones. Even if a play averages 0.1 strokes better, the Safe optimizer will reject it if the penalty variance is high. It steers you away from water carries and tight landing zones.

Aggressive — subtracts $-0.3 \cdot P(\text{green})$ for green-reaching actions. This mode actively hunts for birdies by rewarding shots that can reach the putting surface. On par 5s, it favors going for the green in two. On short par 4s, it may recommend driver over 3-wood even with more risk, because reaching the green in one opens up eagle chances.`}</P>

      <H4>Strategy ranking</H4>
      <P>{String.raw`Strategies are ranked by expected strokes, with fairway rate as a tiebreaker. When two strategies are within 0.3 strokes of each other, the one with a higher first-shot fairway rate is ranked first. This ensures the optimizer doesn't recommend a rough-landing strategy over a fairway-hitting one when the expected scores are practically equivalent.`}</P>

      <H4>Template fallback</H4>
      <P>{`If the DP optimizer returns no results for a hole (e.g., missing fairway or green polygon data), the system falls back to pre-defined strategy templates: Par 3 (Pin Hunting / Center Green / Bail Out), Par 4 (Conservative / Aggressive / Layup), Par 5 (Conservative 3-Shot / Go-For-It / Safe Layup). These use the same Monte Carlo simulation for scoring but with fixed club/aim selections instead of optimized ones.`}</P>

      <H4>Computation budget</H4>
      <P>{String.raw`The DP optimizer's computation breaks down as follows:

Transition sampling: $\sim\!50 \text{ zones} \times 100\text{–}220 \text{ actions} \times 100\text{–}350 \text{ samples}$ (adaptive by hazard density; built once, shared across all modes)

Value iteration: $50 \text{ zones} \times \text{actions} \times 3 \text{ modes} \times \sim\!10 \text{ iterations} \approx 200\text{–}285\text{K evaluations}$

Policy Monte Carlo: $3 \text{ modes} \times 2{,}000 \text{ trials} = 6\text{K trials}$

Holes are parallelized across $\min(\text{CPUs}, 4)$ worker threads for near-linear speedup. Total: ~2–5 seconds per hole, ~30–60 seconds for 18 holes on a 4-core machine. All computation runs server-side so the client stays responsive.`}</P>

      <H4>Constants reference</H4>
      <P>{String.raw`  Zone interval — 20 yards (distance between zone markers)
  Lateral offset — 20 yards (left/right from center line)
  Bearing step — adaptive: 4° (<180y), 3° (180–350y), 2° (350y+)
  Bearing range — $\pm$30° from center line bearing (16–31 bearings)
  Samples per action — adaptive: 100 (safe), 250 (bunkers), 350 (OB/water)
  Rough lie multiplier — 1.15× std deviation
  Carry ratio range — 50%–110% of remaining distance
  Green threshold — green polygon geofence (falls back to 10 yards if no polygon defined)
  Chip range — 30 yards (near-green, chip/putt)
  Chip zone — 10–40 yards (1 chip + putts from 3y)
  Max shots per hole — 8 (safety cap)
  Trials per strategy — 2,000 (Monte Carlo policy scoring)
  Tree canopy height — 15 yards (45 ft)
  Fallback ball apex — 28 yards (84 ft)
  Flight corridor width — 35 yards perpendicular
  Caddy tip aim radius — 50 yards around aim point
  Carry note bearing threshold — 35°
  Value iteration convergence — max change < 0.001 or 50 iterations
  Safe mode variance weight — 0.5
  Aggressive mode green bonus — 0.3`}</P>
    </>
  );
}
