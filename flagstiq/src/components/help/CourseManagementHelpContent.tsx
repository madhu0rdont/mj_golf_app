import { H3, H4, P } from './help-primitives';

export default function CourseManagementHelpContent() {
  return (
    <>
      <H3>How the Strategy Engine Works</H3>

      <H4>Your data in, strategy out</H4>
      <P>{`FlagstIQ builds a personalized strategy for every hole by combining two things: your measured shot data (carry distances, dispersion, lateral bias per club) and the course's GPS features (fairway polygons, hazard polygons, green boundaries, elevation, center lines). The engine runs entirely server-side, typically finishing 18 holes in 30–60 seconds.`}</P>

      <H4>Course setup</H4>
      <P>{`Courses are imported from KML files on the Admin page. Each hole gets GPS coordinates for tee, pin, center line, and fairway/green/hazard polygons drawn on satellite imagery. Elevation data is fetched for tee and pin locations, and the system computes plays-like yardages by adjusting for the elevation delta between them.`}</P>

      <H4>Hazard types and penalties</H4>
      <P>{`Each hazard polygon has a type and a default stroke penalty applied when a simulated shot lands inside it:

  Water — 1.0 stroke (drop behind water, re-hit)
  Out of bounds — 1.0 stroke (stroke-and-distance)
  Greenside bunker — 0.5 stroke (difficult recovery)
  Trees — 0.5 stroke (blocked lie, punch out)
  Fairway bunker — 0.3 stroke (awkward stance)
  Rough — 0.2 stroke (thick grass, less control)

Penalties are configurable from Admin > Hazard Penalties. The green polygon doubles as a geofence — when the ball lands inside it, the hole is considered finished and the putting model takes over.`}</P>

      <H4>How hazard drops work</H4>
      <P>{`When a simulated shot lands in a hazard, the drop follows real Rules of Golf logic:

Out of bounds — a binary search (8 iterations, ~1 yard precision) traces the ball's flight path to find where it crosses the OB boundary, then drops 2 yards back on the playable side.

Bunkers — the ball stays where it landed. The penalty represents the difficulty of playing from sand, not a re-drop.

Water — the ball is moved 5 yards backward along the shot line. If that spot is also in a hazard, the system retreats in 2-yard steps (up to 10 steps) until it finds safe ground.

Anything outside fairway, green, and hazard polygons is treated as rough.`}</P>

      <H3>The Optimizer</H3>

      <H4>Overview</H4>
      <P>{`The optimizer models each hole as a Markov Decision Process and solves it with dynamic programming using continuous interpolation. Rather than snapping the ball to the nearest pre-defined zone, it evaluates each simulated landing in a continuous coordinate system and interpolates the value of any position from nearby anchor states.

This means the optimizer discovers strategies on its own. It might figure out that a 3-wood off the tee followed by a gap wedge scores better than driver-plus-9-iron because the 3-wood avoids the fairway bunker at 260 yards. And because it solves for every anchor on the hole, it already knows the best recovery play if your tee shot ends up in the trees.`}</P>

      <H4>Step 1 — Discretize the hole into anchor states</H4>
      <P>{String.raw`Starting from the tee, the optimizer walks along the hole's center line in 20-yard steps. At each step, it creates three anchors: center (on the center line), left (20 yards left), and right (20 yards right). Each anchor records its GPS position, its hole-frame coordinates $(s, u)$, distance to the pin, elevation, and its lie class.

$$\text{anchors} = \{\text{tee}\} \cup \bigcup_{d=20,40,\ldots} \{\text{center}_d, \text{left}_d, \text{right}_d\} \cup \{\text{green}\}$$

Anchors are placed in a hole-relative coordinate frame. The $s$ coordinate is arc distance from tee along the center line (yards), and the $u$ coordinate is signed perpendicular offset (positive = right of center line when facing the pin). This decouples the optimizer from raw GPS and enables spatial interpolation.

The green anchor is terminal — once the ball lands inside the green polygon (falling back to within 10 yards of the pin if no polygon is defined), the hole is over and only putting remains. A typical par 4 has about 50 anchors.

For doglegs without explicit center line data, the optimizer builds a synthetic one. It walks from tee toward pin in 20-yard steps, scoring candidate directions across a $\pm$75° fan. Candidates on the fairway score +10, inside a hazard score −20, and proximity to the pin earns a small bonus. The result follows the fairway's natural curve around the dogleg.`}</P>

      <H4>Lie classification</H4>
      <P>{String.raw`Each anchor and each simulated landing gets a lie class based on which course polygons contain it. The optimizer recognizes 7 lie types, each with a dispersion multiplier $\lambda$ that widens your shot distribution to model the difficulty of that surface:

  Fairway — 1.0× (clean contact, baseline dispersion)
  Rough — 1.15× (+15%, uncertain contact from thick grass)
  Green — 1.0× (ball at rest, putting model takes over)
  Fairway bunker — 1.25× (+25%, sand lie affects distance and accuracy)
  Greenside bunker — 1.20× (+20%, difficult recovery from sand)
  Trees — 1.40× (+40%, restricted swing, trajectory constraints)
  Recovery — 1.60× (+60%, worst-case lie requiring a punch out)

The lie multiplier is applied to both carry standard deviation and offline standard deviation when sampling shot outcomes. A ball in the trees has 40% wider dispersion than the same club from the fairway.`}</P>

      <H4>Step 2 — Enumerate every possible action</H4>
      <P>{String.raw`From each anchor, the optimizer considers every (club, aim bearing) combination.

Eligible clubs are filtered to those with mean carry between 50% and 110% of the remaining distance — you wouldn't hit driver from 80 yards or a wedge from 280. Drivers are only available from the tee. This usually yields 5–7 clubs per anchor.

Aim bearings span $\pm$30° from the local center line direction. The step size adapts to hole length: 4° for short holes (<180 yards, giving 16 bearings), 3° for mid-length (180–350 yards, 21 bearings), and 2° for long holes (350+ yards, 31 bearings). Using the center line direction instead of aiming straight at the pin naturally routes tee shots down the fairway on doglegs.

Total: roughly 100–220 actions per anchor, all evaluated exhaustively.`}</P>

      <H4>Step 3 — Sample outcome descriptors</H4>
      <P>{String.raw`For each (anchor, club, bearing) triple, the optimizer fires a batch of shots sampled from your measured distributions to build a set of landing outcomes.

$$\text{carry} \sim \mathcal{N}(\mu_\text{carry},\; \sigma_\text{carry} \cdot \lambda) \qquad \text{offline} \sim \mathcal{N}(\mu_\text{offline},\; \sigma_\text{offline} \cdot \lambda)$$

The lie multiplier $\lambda$ comes from the anchor's lie class — a shot from rough uses 1.15×, from trees uses 1.40×, and so on.

The sample count adapts to hazard density near the anchor: 100 samples for safe areas, 250 near bunkers, and 350 near water or OB where precision matters most.

Each sample is projected to a GPS carry landing point with per-shot elevation adjustment, checked for tree collisions along the 3D flight arc, extended by a slope-and-surface-aware rollout to a resting position, checked against hazard polygons (with drop logic and stroke penalties), classified into its lie class, and then projected into hole-frame $(s, u)$ coordinates.

The result is a set of landing outcome descriptors — each recording its $(s, u)$ position, lie class, penalty, and distance to pin. Unlike the old transition table, outcomes are not mapped to discrete zones. They retain their continuous coordinates for interpolation during value iteration.`}</P>

      <H4>Step 4 — Solve via interpolation-based value iteration</H4>
      <P>{String.raw`With the outcome table built, the optimizer computes the expected strokes to finish from every anchor. It runs three times with different objectives, producing three strategies per hole.

To evaluate the value of a landing outcome at any $(s, u)$ position, the optimizer uses a spatial index that groups anchors by lie compatibility:

  Fairway group — fairway anchors
  Off-fairway group — rough, trees, recovery anchors
  Bunker group — fairway bunker, greenside bunker anchors
  Green group — terminal green anchor

For a landing at $(s, u)$ with lie class $\ell$, the engine finds the $k = 6$ nearest compatible anchors and computes Gaussian kernel weights:

$$w_i = \exp\!\left(-\frac{(s - s_i)^2}{2 \cdot 25^2} - \frac{(u - u_i)^2}{2 \cdot 20^2}\right)$$

The continuation value is the weighted average:

$$V(s, u, \ell) = \frac{\sum_i w_i \cdot V_i}{\sum_i w_i}$$

Inside 60 yards of the pin, the engine bypasses interpolation with a short-game model that uses lie-specific expected strokes — for example, a fairway lie at 40 yards gets $1 + \text{putts}(\max(3,\, 40 \times 0.15))$ while a bunker lie adds a penalty.

The Q-value for each action is computed by evaluating every outcome individually:

$$Q(z, a) = \frac{1}{N} \sum_{n=1}^{N} \bigl[1 + \text{penalty}_n + V(s_n, u_n, \ell_n)\bigr]$$

Scoring mode — minimizes pure expected strokes:
$$\pi^*(z) = \arg\min_a\; Q(z, a)$$

Safe mode — penalizes high-variance plays with $+1.0 \cdot \sigma$:
$$\pi^*(z) = \arg\min_a\; \bigl[Q(z, a) + 1.0 \cdot \sigma(z, a)\bigr]$$

Aggressive mode — rewards reaching the green with $-0.6 \cdot P(\text{green})$:
$$\pi^*(z) = \arg\min_a\; \bigl[Q(z, a) - 0.6 \cdot P(\text{green} \mid z, a)\bigr]$$

Iteration starts with all anchors at 10 strokes and the green anchor at $\text{expectedPutts}(0)$. It converges when the maximum value change drops below 0.001 — typically within 10 iterations. The anchor values $V$ store the true expected strokes, while the policy tracks the mode-adjusted preference.`}</P>

      <H4>Step 5 — Extract and score each strategy</H4>
      <P>{String.raw`The optimizer traces each mode's policy from tee to green to build a concrete shot plan — which club to hit, where to aim, expected landing. But to get accurate score distributions, it then runs 2,000 Monte Carlo trials per strategy.

Each trial starts at the tee and follows the policy conditionally: when the ball lands in an unexpected position (rough right instead of fairway center), the system finds the nearest compatible anchor and uses that anchor's optimal action. This produces realistic score distributions that account for recovery shots — the critical advantage over static club sequences.

Trial outcomes are bucketed relative to par:

  $\leq -2$ → Eagle · $-1$ → Birdie · $0$ → Par · $+1$ → Bogey · $+2$ → Double · $> +2$ → Worse

The standard error at 2,000 trials is approximately $\sigma / \sqrt{2000} \approx 0.02$ strokes, precise enough to confidently rank strategies.`}</P>

      <H4>Diversity and ranking</H4>
      <P>{`The optimizer enforces diversity across the three strategies by requiring different opening clubs. If two modes produce the same first club, one is replaced with the best alternative tee action for that mode.

Strategies are ranked by expected strokes, with fairway rate as a tiebreaker: when two strategies are within 0.3 strokes of each other, the one that hits more fairways ranks first. Strategies with identical club sequences are deduplicated.`}</P>

      <H3>Shot Modeling</H3>

      <H4>Lateral bias compensation</H4>
      <P>{String.raw`Most golfers have a consistent lateral miss — a draw, fade, or push. The optimizer compensates by shifting aim points opposite to your measured mean offline. If your driver averages 8 yards right ($\mu_\text{offline} = 8$), it shifts your aim 8 yards left so the expected landing is centered on the target:

$$\text{aimPoint} = \text{project}(\text{target},\; \text{bearing} + 90°,\; -\mu_\text{offline})$$

On the map, the dashed aim line shows where to point the club, and the dispersion ellipses show where the ball actually lands.`}</P>

      <H4>Tree collision detection</H4>
      <P>{String.raw`Each shot's flight arc is checked against tree polygons at 10-yard intervals. The ball's height at each point is compared against a 15-yard (45 ft) canopy height. If the ball is below the canopy and inside a tree polygon, it drops at that point with a 0.5-stroke penalty.

Ball height uses an asymmetric flight model when per-club apex and descent angle data are available:

Ascent phase ($d < d_\text{apex}$): $\quad h(d) = \text{apex} \cdot t \cdot (2 - t)$, where $t = d / d_\text{apex}$

Descent phase ($d \geq d_\text{apex}$): $\quad h(d) = \text{apex} \cdot (\text{carry} - d) / (\text{carry} - d_\text{apex})$

Without measured data, it falls back to a symmetric parabola with a 28-yard (84 ft) apex.`}</P>

      <H4>Rollout model</H4>
      <P>{String.raw`The simulator distinguishes between carry landing (where the ball first contacts the ground) and resting position (where it stops rolling). Rollout is computed per-club and adjusted by landing surface.

The rollout fraction is derived from your measured data when available — if your 7-iron carries 165 and totals 172, the rollout fraction is $(172 - 165) / 165 \approx 4.2\%$. For clubs without measured total distance, a loft-based formula provides a physics estimate:

$$\text{rolloutFrac} = 0.12 \cdot e^{-0.05 \cdot \text{loft}}$$

This gives drivers (~10.5°) roughly 7–8% rollout, mid-irons (~28°) roughly 3%, and wedges (~50°+) near zero — matching real-world behavior where low-lofted clubs with shallow descent angles roll out significantly more.

For each sampled shot, rollout scales proportionally to carry distance: $\text{rollout} = \text{carry} \times \text{rolloutFrac} \times \text{surfaceMultiplier}$. This preserves the natural correlation — a longer carry produces a longer roll. The resting position is projected along the same bearing past the carry landing.

Surface multipliers dampen rollout based on what the ball lands on:
  Fairway — 1.0× (ball rolls freely on mowed surface)
  Green — 0.65× (manicured but ball decelerates on short grass)
  Rough — 0.3× (thick grass kills momentum quickly)
  Bunker — 0× (ball plugs in sand, no rollout)
  Water/OB — 0× (ball is lost, hazard drop resolves it)

After tree collision: if a ball hits trees, it drops dead with no rollout. Otherwise, rollout is applied and the resting position is checked against hazard polygons — so a drive that carries safely past a bunker but rolls into it is correctly penalized.

Slope also affects rollout. At the landing point, the simulator measures the local slope (meters elevation change per yard of ground distance) and applies a slope multiplier: downhill landings roll out more, uphill landings roll out less. The multiplier is clamped between 0.5× and 1.5× to prevent extreme adjustments.`}</P>

      <H4>Per-shot elevation adjustment</H4>
      <P>{String.raw`Rather than applying a single tee-to-pin elevation adjustment, the simulator computes elevation effects for each individual shot using the centerLine's elevation profile.

At course import, the centerLine stores GPS elevation at each waypoint. The optimizer pre-computes an elevation profile — elevation samples every 10 yards along the centerLine — and uses O(1) interpolation to look up elevation at any distance from the tee.

Each anchor records its elevation (meters above sea level) and distance from the tee. When simulating a shot, the elevation delta between the source anchor and the projected landing point determines how far the ball travels along the ground:

$$\text{groundCarry} = \text{carry} - \Delta\text{elev} \times 1.09$$

Uphill shots ($\Delta\text{elev} > 0$) cover less ground — the ball has to climb, so its horizontal footprint shrinks. Downhill shots ($\Delta\text{elev} < 0$) cover more ground — the ball descends longer before touching down.

This adjustment applies to every sampled shot in the outcome table, every Monte Carlo trial, and every greedy recovery shot. Club selection also uses elevation-adjusted "plays like" distance — on an uphill approach, the optimizer selects a stronger club because the ball needs to travel further than the flat distance suggests.

When the centerLine has no real elevation data (e.g., synthetic centerLines for doglegs), all elevations default to zero and the adjustment has no effect.`}</P>

      <H4>Putting model</H4>
      <P>{String.raw`Once on the green, a log-curve model fitted to PGA strokes-gained data converts distance to expected putts:

$$\text{putts}(d) = 1.0 + 0.42 \cdot \ln(d) \qquad \text{clamped to } [1, 3]$$

At 3 yards: ~1.5 putts. At 10 yards: ~2.0 putts. At 30+ yards: capped at 3.

If the ball is 10–30 yards out (chip zone), the trial adds 1 chip stroke plus expected putts from 3 yards. This model serves as both the terminal value in the DP and the finishing condition in Monte Carlo trials.`}</P>

      <H4>Caddy tips</H4>
      <P>{`Each shot in the plan gets a natural-language tip with three components:

Aim direction — the angular shift between a direct line to the target and the bias-compensated aim line ("Aim left" or "Aim right").

Ball movement — your expected lateral bias ("works right to the pin" or "works left to the fairway").

Hazard reference — the most relevant nearby hazard, found by searching within 50 yards of the aim point and along the flight corridor (within 35 yards perpendicular to the shot line). Example: "Aim left of the right bunker, works right to the pin."

Each shot also gets a carry note with hazard context, like "+20y past bunker" or "~5y short of water" — computed by measuring the carry distance to the nearest hazard vertex along the shot bearing.`}</P>

      <H3>Game Plan</H3>

      <H4>18-hole assembly</H4>
      <P>{String.raw`The game plan runs the DP optimizer across all 18 holes, solving each hole in all three modes (Scoring, Safe, Aggressive). Results are parallelized across worker threads for speed, with per-hole progress streamed to the UI in real time.

Each hole gets a color code:
  Green — birdie probability > 15%
  Red — double-or-worse probability > 20%
  Yellow — everything else

The plan identifies 4 key holes — the holes where your strategy choice makes the biggest difference. These are computed by comparing the Scoring and Safe mode expected strokes:

$$\text{delta}_h = |xS_\text{scoring} - xS_\text{safe}|$$

The top 4 holes by delta are flagged as KEY — these are the holes where playing it safe vs. aggressive costs or saves the most strokes.`}</P>

      <H4>Caching</H4>
      <P>{`Game plans are cached server-side and auto-regenerate when your practice data changes (new sessions, updated club distributions) or when course data is modified. The cache key includes the course, tee box, and a hash of your shot data so stale plans are detected automatically.`}</P>

      <H4>Template fallback</H4>
      <P>{`If the DP optimizer returns no results for a hole (e.g., missing polygon data), the system falls back to pre-defined templates: Par 3 (Pin Hunting / Center Green / Bail Out), Par 4 (Conservative / Aggressive / Layup), Par 5 (3-Shot / Go-For-It / Safe Layup). These use the same Monte Carlo simulation for scoring but with fixed club and aim selections instead of optimized ones.`}</P>

      <H3>Constants Reference</H3>
      <P>{String.raw`  Anchor interval — 20 yards along center line
  Lateral offset — 20 yards from center line
  Bearing range — $\pm$30° from center line (16–31 bearings, adaptive)
  Samples per action — 100 (safe), 250 (bunkers), 350 (OB/water)
  Lie multipliers — fairway 1.0×, rough 1.15×, fairway bunker 1.25×, greenside bunker 1.20×, trees 1.40×, recovery 1.60×
  Carry ratio range — 50%–110% of remaining distance
  Green detection — polygon geofence, 10-yard fallback
  Short-game threshold — 60 yards (bypass interpolation)
  Chip range — 30 yards (chip + putt)
  Max shots per hole — 8
  Monte Carlo trials — 2,000 per strategy
  k-nearest neighbors — 6 anchors
  Interpolation bandwidth — 25 yards (s-direction), 20 yards (u-direction)
  Tree canopy height — 15 yards (45 ft)
  Default ball apex — 28 yards (84 ft)
  Convergence threshold — max $\Delta V$ < 0.001 or 50 iterations
  Safe mode variance weight — $+1.0\sigma$
  Aggressive mode green bonus — $-0.6 \cdot P(\text{green})$
  Hazard drop penalty — 0.3 strokes
  Rollout formula — $0.12 \cdot e^{-0.05 \cdot \text{loft}}$ (fallback when no measured total)
  Rollout surface — fairway 1.0×, green 0.65×, rough 0.3×, bunker 0×
  Rollout slope factor — 3.0 (rollout change per unit slope, clamped 0.5×–1.5×)
  Default loft — 30° (mid-iron, used when club loft is unknown)
  Elevation adjustment — 1.09 yards per meter of elevation change
  Elevation profile step — 10 yards between samples`}</P>
    </>
  );
}
