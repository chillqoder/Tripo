Create a polished interactive Three.js scene using the two provided GLB assets:

- A low-poly wizard.
- His separate magic staff with a purple crystal.

Build the complete working project, including asset loading, character animation, the environment, three interactive spells, and the interface. Follow the implementation phases below and complete all of them.

## 1. Scene and visual direction

The wizard stands on a large irregular rock floating in outer space.

Create the rock procedurally, with a broad, reasonably flat upper surface and a rugged, angular underside. Its style should complement the low-poly character. It must look like a floating piece of rock, not a circular display pedestal.

Keep the background simple:
- Nearly black space with a subtle dark-blue tint.
- Sparse stars with gentle twinkling.
- Very slow background movement for depth.
- No elaborate planets, galaxies, or distracting scenery.

The wizard and his magic are the main focus.

Use a slightly elevated front three-quarter camera angle. Keep the entire wizard, the rock, and the raised staff visible, with additional space above the crystal for spell effects.

Use soft lighting that clearly reveals the wizard’s face and purple clothing, subtle rim lighting, and colored light from active spells. Preserve the original models’ appearance and materials.

## 2. Inspect and prepare the GLB assets

Before implementing character animation, inspect both files:
- Scene hierarchy and mesh names.
- Model orientation and dimensions.
- Existing bones, skin weights, and animation clips.
- Whether the wizard’s arms, hands, sleeves, and body are separate meshes.

Do not assume that either GLB contains a usable rig.

Choose the appropriate animation approach:
- If the wizard is rigged, animate the existing bones.
- If suitable body parts are separate meshes, create a pivot hierarchy with anatomically sensible shoulder, elbow, and wrist positions.
- If the wizard is a single static mesh, prepare a minimal rig and skinning, or carefully prepare articulated parts using available asset-processing tools.

Preserve the character’s design. Avoid visible cracks, detached sleeves, distorted shoulders, and stretched geometry.

Do not substitute whole-model rotation for arm animation. The staff-holding arm and the free arm must actually move independently.

If the available geometry makes proper articulation impossible without asset preparation, clearly identify the required preparation instead of pretending that the model is already rigged.

## 3. Scale, placement, and staff attachment

Measure the actual assets before positioning them. Account for their transforms and coordinate systems.

Normalize the wizard to a convenient scene height, then scale the staff proportionally using its measured length. Preserve the original proportions of each model with uniform scaling.

The complete staff, including its crystal, should be approximately as tall as the wizard, or slightly taller. Use a starting length of about 100–110% of the wizard’s full height, then verify the result visually.

Do not normalize the two models independently to arbitrary equal bounding-box dimensions.

Position both feet firmly on the rock:
- No hovering.
- No feet buried inside the rock.
- No sliding during animation.

Place the staff naturally inside the intended gripping hand. Determine the correct hand from the actual asset rather than assuming a particular side.

Create:
- A hand attachment point.
- An adjustable local grip offset on the staff.
- An effect emission point at the crystal tip.

Attach the staff through the hand’s animation hierarchy so that it follows every hand and arm movement without drifting or lagging. Its pivot must support natural movement around the grip.

Keep the staff clear of the wizard’s boots and body. Preserve its thin lower tip; do not add a broad base or pedestal.

Expose important alignment values in a clearly organized configuration section so they can be adjusted easily.

## 4. Idle animation

Create a continuous, subtle idle animation:
- Gentle breathing in the chest and shoulders.
- Slight head movement.
- Small, slow upper-body sway.
- Minimal movement of the staff-holding wrist and arm.
- A relaxed free arm with occasional small movements.

The wizard should feel alive and calm, not exaggerated or rubbery.

Keep both feet planted. Apply breathing primarily to the upper body rather than scaling or bouncing the entire character.

The floating rock may move very slowly up and down and tilt almost imperceptibly. The wizard must move with the rock as part of the same scene hierarchy.

Use time-based animation with smooth interpolation. Prevent cumulative transform drift.

## 5. Shared spell animation

Create three spells: Lightning, Fire, and Water.

Each complete spell cycle must last no more than five seconds, including preparation, active effects, fading, and recovery.

Use this approximate timeline:
- 0.0–0.7 seconds: smoothly raise the staff-holding arm and bring the crystal overhead.
- 0.7–3.8 seconds: hold the casting pose while the spell is active.
- 3.8–4.4 seconds: fade out the spell while keeping the staff raised.
- 4.4–5.0 seconds: lower the staff and blend back into idle.

Keep the staff raised until the visible spell effects have finished.

During casting:
- Maintain a firm grip on the staff.
- Add gentle upper-body sway and small controlled reactions.
- Let the staff respond with subtle motion.
- Animate the free arm performing a slow circular channeling gesture.
- Add small wrist and hand movements where supported by the model.
- Keep the feet planted.

Blend poses smoothly. Avoid sudden snapping at the beginning or end of a spell.

Use a clear state machine such as:
IDLE → PREPARE → CAST → FADE → RECOVER → IDLE.

Allow only one active spell at a time. Disable the spell buttons until recovery finishes. Repeated clicks must not stack effects or break the animation.

## 6. Spell effects

All three spells must originate visibly from the staff’s crystal and also create effects that fall downward through the visible scene.

Use world-space effects with downward motion that reads clearly from the default camera. Preserve the wizard’s visibility and keep the interface unobstructed.

### Lightning

Create an energetic electrical spell:
- Blue-white branching bolts erupt from the crystal.
- Small electrical arcs surround the crystal and upper staff.
- Additional jagged bolts descend from above through the scene.
- Use bright cores, softer colored glow, and rapidly changing branches.
- Add brief, restrained light pulses on the wizard and rock.

Lightning must look sharp, irregular, and electric, rather than like straight falling lines.

Avoid prolonged full-screen flashes.

### Fire

Create a warm, forceful fire spell:
- Flames and embers swirl around the crystal and upper staff.
- Several burning rock fragments descend from above toward the bottom of the frame.
- Give the fragments visible rocky cores, flame trails, and sparks.
- Vary their size, speed, rotation, and trajectories.
- Add flickering orange-red illumination to the wizard and rock.

The falling fire should read as small flaming meteor fragments, not ordinary orange particles. Keep the character clearly visible.

### Water

Create a flowing water spell:
- Blue-cyan streams spiral around the crystal and upper staff.
- Curved ribbons or streams of water flow outward and downward.
- Rain begins across the scene and falls toward the bottom of the frame.
- Add droplets and subtle splashes where rain reaches the rock.
- Use translucent surfaces and moving highlights so the effect reads as liquid.

Avoid making the water look like blue smoke, rigid tubes, or static glass.

Give each spell a distinct visual identity, motion style, and color palette.

All particles, trails, lights, and remaining effects must disappear by the end of the five-second cycle.

## 7. Interface

Place exactly three circular spell buttons in a centered row near the bottom of the screen:

1. Lightning bolt icon.
2. Flame icon.
3. Water droplet icon.

Use clean, recognizable icons, preferably inline SVG rather than platform-dependent emoji.

Button styling:
- Dark translucent backgrounds.
- Clear circular borders.
- Comfortable spacing and touch targets.
- Blue-violet accent for Lightning.
- Orange-red accent for Fire.
- Cyan accent for Water.
- Subtle hover and pressed animations.
- A visible active or cooldown state.

Keep the interface compact and visually consistent with the scene. It must not cover the wizard’s feet or the important parts of the rock.

Support mouse and touch input. Optional keyboard shortcuts: 1, 2, and 3.

Include a simple loading indicator and a clear error message if a model cannot load.

## 8. Technical requirements

Use Three.js and GLTFLoader. Use one consistent Three.js version across the project and its addons.

Keep the project straightforward to run locally. Prefer a small Vite project with organized modules and a short README.

Use the supplied GLB files as the actual character and staff. Do not replace them with primitive placeholder models.

Generate the rock, stars, and spell effects procedurally. Do not depend on unrelated external art assets.

Organize the implementation into clear systems:
- Asset loading and preparation.
- Scene and lighting.
- Character animation and staff attachment.
- Spell state and timing.
- Lightning, Fire, and Water effects.
- Interface.

Use frame-rate-independent updates, reusable effect objects, and sensible particle limits. Avoid creating new geometries and materials every frame.

Handle resizing and cap rendering resolution appropriately for performance. Keep transparency and glow controlled so the image remains readable.

If camera controls are included, restrict them to a useful viewing range. Do not automatically rotate the camera during spells.

## Implementation plan

Work in this order:

### Phase 1 — Asset inspection
Load and inspect both GLBs. Establish the real animation capabilities of the wizard. Prepare any required rig or articulated hierarchy before building spell choreography.

### Phase 2 — Static composition
Create the floating rock, sparse star background, lighting, and camera. Place the wizard correctly on the rock.

### Phase 3 — Staff alignment
Measure and scale the staff, align its grip with the hand, and attach it to the correct animation hierarchy. Verify that hand motion carries the staff correctly.

### Phase 4 — Idle animation
Implement breathing, subtle body motion, and gentle staff movement while keeping the feet planted.

### Phase 5 — Casting choreography
Implement the complete five-second casting cycle and free-hand gesture. Test it without effects first. Confirm that the grip remains correct throughout the movement.

### Phase 6 — Spell effects
Implement and test Lightning, then Fire, then Water. Connect their emission points to the animated crystal tip.

### Phase 7 — Interface
Add the three circular buttons, input handling, loading feedback, and cooldown behavior.

### Phase 8 — Polish and verification
Tune the timing, lighting, particles, camera framing, and transitions. Test repeated casts and resizing. Fix visual and technical problems before delivering.

## Acceptance criteria

The finished project must demonstrate that:
- The provided wizard stands naturally on a floating rock in space.
- The background remains simple and secondary.
- The staff has believable proportions and stays in the gripping hand.
- The wizard breathes and moves subtly while idle.
- Both arms participate in casting.
- The staff stays raised throughout visible spell effects.
- Each button triggers a distinct, complete spell lasting no more than five seconds.
- Lightning, flaming fragments, and rain visibly descend through the scene.
- Every spell fades completely and returns smoothly to idle.
- Repeated casts cause no duplicated effects, transform drift, or growing resource usage.
- The full character and raised staff remain inside the frame.

Deliver the complete working source code, any prepared assets needed to run it, and concise setup instructions. Explain the animation approach actually used and disclose any remaining asset limitations.