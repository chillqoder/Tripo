# Living Aquarium — Three.js Project Using the Supplied GLB Assets

## Goal

Build a complete, beautiful, interactive Three.js aquarium using the existing GLB models listed below. The animals, four plants, castle, aerator, small pebbles, and large rocks have already been modeled. Load and use those assets; do not recreate them with procedural primitives, substitute different assets, or replace them with newly generated models.

Create the aquarium itself, its glass, water, sand substrate, supporting frame, airline hose, lighting, bubbles, ripples, and other environmental effects in code. Prepare the supplied models for convincing animation and integrate everything into one coherent underwater scene.

The visual target is a polished, semi-realistic 3D game scene: believable materials, attractive lighting, recognizable imported models, natural movement, and carefully composed scenery. The tank should look like a normal, maintained, inhabited aquarium, with slight biological buildup and a little suspended matter. It must not look sterile, perfectly pristine, excessively dirty, or cloudy enough to hide the animals.

This is an artistic mixed-species aquarium. Keep the supplied freshwater and marine fish together as an intentional visual choice; do not change the inventory for biological compatibility.

Implement the stages in order. Each stage must produce working, inspectable results before dependent systems are added. The deliverable is the completed runnable project, not just a plan, a collection of model previews, or a static scene.

## Supplied Asset Manifest

Use these filenames exactly, including plus signs and the space in the second snail filename. Resolve them against one configurable asset base path, such as `public/models/` in the source tree and `/models/` at runtime, or the project's existing equivalent.

| File | Required use |
| --- | --- |
| `guppy+fish+3d+model.glb` | One guppy |
| `orange+clownfish+3d+model.glb` | One clownfish |
| `freshwater+angelfish+3d+model.glb` | One freshwater angelfish |
| `bettafish+3d+model.glb` | One betta |
| `crab+3d+model.glb` | One crab |
| `snail+3d+model.glb` | One of the two snails; inspect its actual appearance before assigning its role |
| `snail+3d+model 2.glb` | The other snail; inspect its actual appearance before assigning its role |
| `grass+plant+3d+model.glb` | One of the four supplied aquatic plants |
| `green+leafy+plant+3d+model.glb` | One of the four supplied aquatic plants |
| `green+plant+3d+model.glb` | One of the four supplied aquatic plants |
| `aquatic+plant+3d+model.glb` | One of the four supplied aquatic plants |
| `medieval+castle+3d+model.glb` | One aquarium castle ornament |
| `sponge+air+filter+3d+model.glb` | One internal black sponge filter / aerator |
| `stone+rock+3d+model.glb` | One of the two stone collections; inspect and identify whether it contains the small pebble set or the large rock set |
| `stone+rocks+3d+model.glb` | The other stone collection; inspect and identify its role |

The four intended plant appearances are Vallisneria, Anubias, Java fern, and Cabomba. Match these names to the actual loaded geometry by leaf shape. Do not assume a species from a generic filename. Use all four supplied plant files once each, preserving their modeled appearance even if their botanical identity is approximate.

Assign the amber-brown snail to the bottom and the contrasting cream/olive patterned snail to the front glass if their appearance supports that assignment. Otherwise use both supplied models and record the actual mapping.

The manifest is based on the supplied filename list. Do not pretend the GLB internals, rigging, animation clips, mesh separation, or stone identities have already been inspected. Verify those properties from the actual files at implementation time.

## Exact Scene Inventory

- One large rectangular glass aquarium, open at the top, with five glass panels, a narrow rim, and a restrained dark base frame.
- One water volume with a moving surface, actual optical refraction, subtle reflections, and a visible waterline.
- Exactly four fish: one instance of each supplied fish model.
- Exactly one crab, using the supplied crab model.
- Exactly two snails: one crawling on the bottom and one crawling on the inside of the front glass.
- Exactly four rooted plant specimens/clusters: one instance of each supplied plant asset. Multiple stems or leaves within one imported plant are still one specimen.
- Exactly one supplied castle ornament.
- Exactly one supplied sponge aerator, with one added thin airline hose that connects to it and exits over the rear rim.
- One continuous sand substrate, covered densely with individual pebbles instanced from the three separated small-stone source variants.
- Exactly three large accent rocks: one placement of each of the three separated large-rock variants.
- A continuous bubble plume, localized surface ripples, restrained underwater particles, and moving caustic lighting.

Do not display either original three-stone collection as an intact group inside the tank. Do not place extra source collections next to the separated stones. Do not add additional animals, plant clusters, or large rocks.

## Project and Implementation Rules

- Work within the existing Three.js project and preserve its package manager, build setup, and conventions. If no project exists, create a small runnable project with a documented start command.
- A modular project with local GLB files is appropriate. The original restriction requiring one entirely self-contained procedural HTML file no longer applies.
- Use `GLTFLoader`. Keep Three.js core and addons on the same version. Use the project's installed dependencies, or matching pinned CDN imports if the project uses that approach.
- Load embedded GLB textures and resolve any referenced companion resources. Configure optional Draco, Meshopt, or KTX2 support only when the actual assets require it.
- Do not load unrelated models, stock asset packs, replacement textures, or external HDR environments. Procedural environment lighting and subtle environmental textures are allowed.
- Keep imported geometry, UVs, colors, and identifying details. Re-rigging, segmentation, pivot correction, material tuning, and mesh deformation derived from the supplied geometry are allowed and required where needed for animation.
- Organize asset loading, normalization, stone extraction, animal animation, navigation, collision handling, substrate queries, optics, bubbles, and rendering as clear modules or systems.
- Maintain one simulation clock. Use elapsed simulation time and delta time in seconds, with a bounded fixed-step or substepped update for movement and collision resolution. Clamp catch-up after a hidden tab resumes.
- Support responsive resizing, touch interaction, a camera outside the aquarium, pause/resume, and reset view.

---

## Stage 1 — Audit and Load the Actual Assets

1. Locate all 15 supplied GLB files and load them through an explicit manifest. Construct asset URLs safely; preserve literal plus signs and handle the space in `snail+3d+model 2.glb` correctly. Serve the project over HTTP rather than relying on `file://` access.
2. For every asset, inspect its hierarchy, meshes and primitives, materials, textures, bounding dimensions, local axes, pivots, bones, skin weights, morph targets, and animation clips.
3. Use a temporary neutral preview to inspect each asset individually, then remove that preview from the final presentation. Identify actual fish facing directions, fish up axes, fin regions, crab joints, snail contact surfaces, plant roots, the castle entrance, and the aerator outlet and air connection.
4. Determine which stone file contains the three small pebbles and which contains the three large rocks. Determine the four plant identities and two snail roles from appearance.
5. Remove imported preview cameras, lights, floor planes, or display supports if present, while retaining all intended object geometry. Do not mistake a pale texture on the object for an unwanted background.
6. Define a configuration entry for every asset containing normalization transforms, target size, attachment points, animation regions, and collision proxies. Do not guess identical pivots or orientation for every file.
7. Show real loading progress. Report failed paths or unsupported assets clearly; do not silently replace missing models with primitives or present an incomplete aquarium as finished. Continue independent implementation work when a particular asset is blocked.

**Acceptance:** every required model is accounted for, actual asset structure has been inspected, and the source-to-scene mappings are recorded in code or project notes.

## Stage 2 — Normalize Models and Separate Both Stone Collections

### Coordinate system and scale

- Use Y as the world up axis. Standardize the forward and up axes of each animal through wrapper groups or explicit rest transforms.
- Measure world-space bounds after imported transforms have been applied. Normalize scale and pivots consistently, preserving original proportions. Do not stretch a fish independently along different axes just to fit a target box.
- Put bottom-object placement pivots at meaningful contact points, plant pivots at their root bases, and fish navigation pivots near their body centers.
- Retain immutable rest-pose data for deformation. Account for parent transforms and mesh-local coordinates when defining masks or attachment points.

### Extract individual stones from the supplied geometry

1. Inspect the internal structure of each stone collection. If its stones already exist as separate nodes, extract the relevant node groups while preserving their complete child geometry and materials.
2. If multiple stones were merged into one mesh, split them using disconnected geometry components or spatial segmentation of the existing geometry. Account for duplicated vertices at UV seams; naive index connectivity alone can split a single stone into many fragments.
3. Cluster fragments into the three actual stones by their spatial location. Do not treat every small disconnected fragment as a separate stone. Preserve material groups, UVs, normals, indices, and the original surface appearance.
4. Bake the collection transforms as needed, remove the original spacing between stones, recenter each extracted stone, and establish its lowest resting point. Confirm each one can be placed independently without pieces being left behind.
5. Produce three reusable small-pebble templates and three separate large-rock assets derived from the originals. If segmentation needs a one-time preprocessing step, save the derived assets with reproducible preparation instructions. Do not remodel replacement stones.
6. Do not instantiate the unseparated collection and try to hide unwanted stones by scaling or clipping them away.

**Acceptance:** all six stone variants can be previewed and placed independently, with correct materials, orientation, and contact pivots.

## Stage 3 — Construct a Spacious Aquarium and Compose the Scene

1. Start with an interior approximately **12 units wide × 6 units deep × 7 units high**, with the bottom near Y = 0 and the waterline near Y = 6.5. Increase dimensions if the measured imported models need more clearance.
2. Create front, back, left, right, and bottom glass panels with believable thickness, restrained greenish edge tint, narrow seams, and physically plausible highlights. Keep the top open.
3. Add a narrow upper rim, matte dark lower frame, and simple dark pedestal with a contact shadow.
4. Begin with a slightly elevated front three-quarter camera view showing the complete tank, one side, water surface, and foreground bottom route.
5. Place the castle toward the rear center, the aerator toward the rear right, and the four plants in distinct surrounding positions. Keep the castle entrance and aerator readable.
6. Reserve a broad central swimming volume, generous turning room, and visible foreground routes for the crab and bottom snail. Separate resting places for the three large rocks must not obstruct those routes.

Initial size guidance, adjusted to actual models and their complete animated silhouettes:

| Object | Approximate target size |
| --- | --- |
| Guppy | 1.0–1.25 units total length |
| Clownfish | 1.25–1.55 units total length |
| Angelfish | 1.15–1.45 units body length; roughly 1.8–2.2 units total height including fins and filaments |
| Betta | 1.5–1.9 units total length including flowing fins |
| Crab | 1.0–1.25 units across its extended walking legs |
| Each snail | Roughly 0.35–0.5 units shell size |
| Castle | Roughly 2.4–2.9 units tall, sized to leave open water above and around it |

Use these as composition guides, not reasons to distort the models. Size the tank around the animals' actual movement envelopes.

**Acceptance:** the empty tank and normalized static layout look convincing, all imported objects fit comfortably, and the central water volume is visibly open.

## Stage 4 — Add Sand, Dense Individual Pebbles, and Three Large Rocks

- Build a continuous shallow sand layer with physical thickness and a gently varied upper surface. Use a natural muted beige palette with subtle grain detail and fine roughness; avoid a flat untextured plane or a layer of oversized sand spheres.
- Slope the substrate slightly upward toward the rear, with restrained local variation near planted bases and decorations. Keep sand contained by the inner glass boundaries.
- Cover most of the bottom with hundreds of **individually placed pebble instances** derived from the three separated small-stone templates. Begin around 700–1,400 instances and tune density to their final size and the tank footprint. Leave a few small sand patches and sand-filled gaps visible.
- Mix the three pebble variants, rotations, and modest scale variation while preserving their original materials. Avoid obvious rows, repeated triplets, floating stones, and deep interpenetration. Choose stable resting orientations instead of arbitrarily tumbling flattened stones.
- Use `InstancedMesh` or an equivalent efficient arrangement. For a template containing several material primitives, instance its component meshes consistently so each placed pebble remains one coherent stone.
- Place **each of the three extracted large rocks exactly once**, at three different locations. No repeated large-rock clones and no intact source collection.
- Seat the castle foundation and aerator base into the substrate slightly. Root plants appropriately; do not bury an Anubias-like rhizome entirely under the sand.
- Provide a continuous substrate-height and normal query, plus simplified large-rock surfaces for bottom contact. Let animals follow the general bed and suitable stone climbs rather than every tiny gravel vertex.

**Acceptance:** the bottom has a substantial sand-and-pebble bed, the three pebble variants are distributed individually, and exactly three distinct large rocks are naturally grounded.

## Stage 5 — Integrate the Existing Castle, Plants, and Aerator

- Place the supplied castle without rebuilding its towers or walls. Tune material response for underwater lighting while preserving its existing textures and character.
- Inspect whether its arched entrance is a genuine opening. Build collision proxies around actual solid walls and towers. Allow doorway traversal only when a real opening exists and the animal's full animated shape fits. If the supplied asset has a blocked entrance, treat it as solid; do not fake a traversable opening.
- Place one instance of each supplied plant. Keep all rooted bases in contact with the substrate, with no suspended root balls. Preserve each plant's distinct silhouette.
- Position the existing aerator so its actual outlet is visible, unobstructed, and submerged.
- Add one thin flexible airline hose using a smooth curve and tube geometry. Connect it to the aerator's actual air intake when present; otherwise add only a small connector. Do not plug the hose into or block the main water/bubble outlet.
- Route the hose upward along the rear interior and over the back rim, continuing a short distance outside the aquarium. Give it finite thickness, a plausible bend radius, and a subdued dark or translucent appearance. It must not intersect the rim or glass. The external air pump can remain outside the frame.
- Define named local attachment points for the bubble outlet, hose connection, and plant roots so those points remain correct after scaling and placement.

**Acceptance:** every supplied decoration is integrated, the hose is visibly connected and exits the tank correctly, and the castle, plants, rocks, and filter have useful collision/contact data.

## Stage 6 — Implement Water, Glass Optics, and Real Refraction

Treat water as a rendering system, not just a blue transparent box.

### Surface and waterline

- Use a sufficiently subdivided surface inside the glass boundaries, slightly below the rim.
- Combine low-amplitude waves with different directions and phases. Start with amplitudes around 0.005–0.03 units at the proposed tank scale; tune for a gentle indoor aquarium.
- Derive surface normals from the same displacement function. Include a thin waterline and a subtle meniscus at the glass.
- Provide one shared surface-height function for rendering, bubble arrival tests, fish surface limits, and ripple evaluation. Avoid CPU and GPU versions drifting out of sync.
- Reserve a localized disturbance region above the aerator plume, stronger than the quiet movement elsewhere but still restrained.

### Refraction and reflection

- Use a water IOR near 1.333 and a glass IOR near 1.5. Keep glass thickness, transmission, reflection, and roughness physically coherent.
- Looking through a moving surface wave from an elevated camera must visibly bend and shift the silhouettes of fish and the edges of submerged scenery. This is mandatory. A moving highlight or normal map alone does not satisfy it.
- Implement a suitable scene-color/depth or other transmission solution for nested glass and water. Do not rely on arbitrarily stacking transparent meshes and hope the sorting works.
- Capture a stable view of submerged content for refraction, excluding the refractive surface from its own capture. Handle transparent fins and glass deliberately; avoid recursive feedback, missing fish, dark halos, screen-edge holes, and unstable depth discontinuities.
- Blend transmission with angle-dependent Fresnel reflections. Keep the surface readable from above and more reflective at grazing angles.
- Apply subtle depth-dependent absorption and underwater haze. Preserve fish colors and readable details through the front and side panes.
- Apply refraction only where rays pass through the relevant water/glass surfaces. Do not wobble the entire scene or interface. Waves should not distort a foreground fish viewed through a flat pane as though the ray had crossed the top surface.

**Acceptance:** inspecting from above clearly shows animated optical distortion of the actual fish and castle; inspecting from the front and sides preserves readable inhabitants without milky layers or transparency artifacts.

## Stage 7 — Connect Aerator Bubbles to Surface Ripples and Current

1. Emit bubbles from the supplied aerator's actual outlet attachment point, respecting its world-space transform. If the outlet points sideways, let newly emitted bubbles follow it briefly before buoyancy bends their motion upward.
2. Start near 10–20 bubbles per second with irregular emission, varied small radii, varied rise speeds, gentle wobble, and restrained lateral drift. Use a narrow source and a plume that widens gradually as it rises.
3. Render clear bubbles with curved bright highlights and subtle refraction. Avoid opaque white spheres or identical evenly spaced beads.
4. Keep size nearly constant or allow slight expansion during ascent. Do not shrink bubbles away while they are still underwater.
5. Detect each bubble's intersection with the **animated** water surface, recycle it there, and trigger an expanding, fading ripple at that actual arrival position. Aggregate nearby arrivals when needed.
6. Feed ripple displacement into the same surface normal/refraction system, so bubble arrivals create waves that really distort the fish when viewed through them.
7. Define a gentle spatial current with a localized upward plume. Reuse it for bubble drift, nearby foliage, faint particles, and subtle fin response; vary response by object stiffness and position.
8. Pool bubble and ripple data. Do not continuously allocate new geometry or materials in the animation loop.

**Acceptance:** the outlet, rising bubbles, localized current, and rippling refractive surface visibly form one connected system.

## Stage 8 — Prepare Imported Animals for Real Articulation

Do not assume image-generated GLBs include usable rigs, named body parts, or animation clips.

Use the best available method for each actual asset:

1. If it has suitable bones and animation clips, use `AnimationMixer` and tune or blend those clips for the required movement.
2. If fins, legs, or other moving parts are separate meshes, correct their attachment pivots and build proper articulated parent groups.
3. If the animal is one static merged mesh, derive a rig or deformation setup from its existing geometry. Segment or weight meaningful regions using inspected anatomy, connected regions, and per-asset masks. A reproducible offline rigging step is acceptable when needed; implement and include the result rather than merely suggesting future rigging.
4. Keep original rest positions and transform into a consistent anatomical coordinate space before deformation. Never accumulate vertex drift by modifying the previous frame's already deformed pose.
5. Use smooth weights at attachments, keeping eyes, mouth, rigid shell regions, and fin roots stable where appropriate. Preserve UVs, material groups, and recognizable anatomy.
6. Keep shader-deformed geometry consistent in shadow/depth passes and conservative animated bounds, so fins do not cast static shadows, disappear through culling, or escape collision envelopes.

Different assets may need different methods. A named wrapper group with no actual fin or limb articulation is not sufficient. Translating a completely rigid fish, rotating an entire crab to fake walking, or moving a plant as one solid object is not acceptable.

**Acceptance:** every fish can move its tail and fins without detached parts, and the crab can articulate its walking legs. The imported models still retain their original appearance.

## Stage 9 — Animate the Four Fish Individually

### Guppy

- Preserve the supplied slender body and patterned fan tail.
- Use lively but smooth upper-to-middle-water movement, short gentle accelerations, and brief hovering pauses.
- Send lateral motion from the rear body through the tail, increasing flexibility toward the tail edge. Add independent small pectoral flutters.

### Clownfish

- Preserve the supplied stockier silhouette, orange color, and white bands.
- Use steady mid-water swimming, controlled turns, and occasional approaches toward plants or the castle.
- Animate modest body undulation, lateral tail strokes, and pectoral sculling. Keep the head relatively stable.

### Freshwater angelfish

- Preserve the tall flattened body, high dorsal/anal fins, and long pelvic filaments.
- Use calm gliding, broad turns, slow depth changes, and controlled hovering.
- Add restrained fin-edge motion and gently trailing filament motion while keeping attachments fixed. Its full tall silhouette must fit all routes.

### Betta

- Preserve the supplied blue/violet body and large flowing fins.
- Use slow deliberate upper-middle-water exploration and graceful pauses and turns.
- Deform the caudal, dorsal, and anal fins with delayed traveling waves. Keep roots attached and trailing edges flexible; do not flap large fins as rigid plates.

For every fish, couple swimming effort to speed and acceleration. Faster travel increases tail activity; hovering keeps fine fin adjustments without constant vigorous tail thrashing. Preserve natural upright posture and avoid exaggerated rolling or head shaking.

**Acceptance:** the four fish have visibly different swimming personalities, moving tails and fins, and coherent anatomy during both travel and hovering.

## Stage 10 — Implement Navigation and Reliable Non-Contact Collisions

- Give each fish its own motion state, independent seed, preferred depth range, speed profile, turn limits, wander targets, and animation phase. Do not move all four on matching circles or synchronized loops.
- Steer with bounded acceleration and angular velocity. Align each fish's corrected forward axis with its actual motion using smooth quaternion interpolation; allow restrained pitch and banking while keeping it upright.
- Use predictive avoidance of inner glass walls, substrate, the moving water surface, the castle, aerator, hose where relevant, large rocks, plant bases and dense foliage regions, the other fish, and nearby bottom animals.
- Measure collision shapes from the normalized model and expand them to include the full animation envelope: tails, spread fins, angelfish filaments, and turning clearance. Center-point tests alone are insufficient.
- Use suitable combinations of spheres, capsules, oriented boxes, or other simple conservative shapes. Do not make one loose spherical proxy so large that an otherwise open aquarium becomes unnavigable.
- Predict future closest approaches between fish and begin steering early. Fish must not touch, pass through, or visibly interpenetrate one another, including their fins and tails.
- Add a collision safety solver after predictive steering. Recheck constraints after correction so separating two fish does not push one through the glass or into scenery. Use bounded substeps and swept path checks to prevent tunneling at low frame rates.
- Check the full path and turning volume, not only destination points. Route around solid castle walls. Treat the doorway as traversable only if its actual opening and the complete animated animal shape permit safe passage.
- Choose safe nonoverlapping initial positions. Keep each fish fully below the current local surface and above the substrate at all times.
- Recover from blocked routes by slowing, choosing a safe alternate direction, and changing targets smoothly. No teleporting, snapping, indefinite jitter, or getting trapped in a corner.

A rigid-body physics engine is optional. Reliable visible non-contact behavior is required regardless of the implementation method.

**Acceptance:** all four fish can swim for several minutes without touching one another or crossing the glass, waterline, substrate, or solid decorations, including during turns and frame-rate dips.

## Stage 11 — Make the Imported Crab Walk Sideways on Its Legs

- Use the supplied crab model, preserving its shell and appendages. Identify the actual visible limb structure; do not fabricate a claim that a defective or incomplete imported model has correct anatomy. If preparation is needed, derive articulation from the supplied geometry and report any unavoidable asset limitation precisely.
- Build a predominantly sideways foreground route. Its facing direction and travel direction must be independent: sideways travel should not be implemented by turning the crab's face toward its velocity.
- Articulate available leg segments with coordinated alternating groups. During stance, feet remain planted in world space relative to the substrate; during recovery, feet lift, move, and set down again.
- Use inverse kinematics or equivalent constrained joint animation with ground targets. Coordinate body translation with actual steps instead of sliding the body over stationary or cycling feet.
- Follow the substrate's height and slope with small stable body adjustments. All feet should remain plausibly grounded, with no floating or deep burial.
- Keep the shell largely rigid. Allow restrained claw and mouthpart motion; occasionally make a small exploratory claw gesture during a pause if the geometry permits it.
- Avoid walls, rocks, solid castle sections, plant bases, and the bottom snail. Keep pauses, starts, and changes in sideways direction smooth.

**Acceptance:** the crab is clearly walking sideways on articulated legs, with grounded stance phases and no skating across the bottom.

## Stage 12 — Animate Both Snails with Correct Surface Contact

### Bottom snail

- Use the chosen supplied bottom-snail asset and keep it on a visible foreground route.
- Crawl very slowly with subtle foot/head motion and tentacle exploration where the geometry supports it. Keep the shell attached and mostly rigid.
- Follow the sand-and-pebble bed and make gentle climbs over suitable small stones. Smooth the contact surface enough to avoid jumping between individual gravel peaks.
- Avoid the crab and solid obstacles without teleporting or tipping the shell unnaturally.

### Front-glass snail

- Use the other supplied snail and start on the inside of the front pane, in the lower third and away from the central fish viewing area.
- Identify the model's actual foot plane and orient that surface against the glass. The shell projects inward into the water; the viewer outside the tank should understand the contact.
- Crawl extremely slowly along a short vertical or diagonal route. Keep the contact point constrained to the same inner pane and below the waterline.
- Preserve correct attachment during small head, foot, and tentacle movements. No floating gap, shell sticking outside the tank, drifting away from the pane, or body penetration through the glass.

**Acceptance:** exactly one snail is grounded on the substrate and one is visibly attached to the inside front glass; both remain alive through subtle motion even during long slow intervals.

## Stage 13 — Animate the Four Existing Plants

- Apply gentle deformation to the existing plant geometry. Preserve leaf and stem attachment and keep root positions fixed.
- Build species-appropriate masks from the actual model: broad slow tip bending for ribbon leaves, small stiff movement for thick oval leaves, delayed frond bending for lance-shaped foliage, and finer more responsive motion for feathery branching foliage.
- Vary phases and amplitudes among leaves and stems. Let nearby aerator flow affect foliage more than distant quiet-water plants.
- Do not pivot each complete plant back and forth as a rigid prop. Do not detach leaves, stretch roots, or wave every plant in perfect synchrony.
- Keep the animated foliage envelope within the tank and use it when defining safe fish routes. Tall leaves must stay below the surface unless the supplied plant is intentionally positioned lower to fit.

**Acceptance:** all four imported plants remain rooted and recognizable, with distinct restrained movement caused by the shared current.

## Stage 14 — Add Lighting, Caustics, and a Slightly Lived-In Appearance

### Lighting and visual cohesion

- Add a soft aquarium key light above the tank and restrained cool fill. Use consistent color management, suitable tone mapping, balanced exposure, and plausible material roughness.
- Preserve supplied texture colors and detail. Avoid excessive metallic fish bodies, plastic-looking rocks, black unreadable plants, blown-out white bands, or opaque fin edges.
- Add soft shadows and contact shading under the castle, aerator, rocks, crab, snails, and plant bases. Keep shadow and depth rendering consistent with any animated mesh deformation.
- Project delicate animated caustics onto submerged sand, pebbles, castle, and appropriate nearby surfaces. Derive their motion from the water waves or a coherent approximation, including gentle local disturbance near the bubble plume.
- Caustics must be spatially attached to submerged geometry. Do not apply a full-screen moving light overlay or illuminate dry pedestal surfaces as though they were underwater.

### A maintained, inhabited aquarium

- Introduce a very faint natural cool-green or warm-green water tint and restrained depth haze, with clear visibility across most of the tank.
- Add a small number of faint suspended particles of varied sizes, drifting with the current. Keep them separate from bubbles; avoid a snowstorm or thick cloud.
- Add sparse, subtle green-brown biofilm near lower glass edges, corners, seams, and sheltered parts of the substrate. Leave the main viewing area largely clear.
- Add a thin, uneven mineral/waterline trace and occasional very faint glass smudges or fine surface imperfections. Keep them understated and consistent with a maintained tank.
- Use slight settled detritus or darker sand in a few protected crevices if needed. Integrate these details without adding distracting debris props or hiding imported textures.
- Keep the surface visually fresh, without thick oil slicks, foam blankets, or exaggerated scum. The impression is an ordinary cared-for aquarium, not a neglected enclosure.

**Acceptance:** the scene feels inhabited and natural while fish remain easy to see; water motion, bubbles, plant motion, reflections, and light patterns belong to the same environment.

## Stage 15 — Add Camera Controls and Finish the Presentation

- Provide smooth orbit, zoom, and restrained panning using `OrbitControls` or the project's equivalent, including touch support.
- Constrain camera position and target so zooming or panning cannot place the camera inside the glass, below the substrate, or inside the pedestal. Maintain safe clearance from the whole tank, not just its center.
- Start with a carefully framed stationary view of the complete aquarium. No compulsory auto-rotation.
- Add only a small unobtrusive reset-view control and pause/resume control. A loading indicator may appear while assets initialize and should disappear when ready.
- Pausing freezes simulation time for fish travel, tails, fins, crab joints, snail movement, plants, waves, bubbles, ripple lifetimes, particles, and caustics. Camera inspection remains available. Resuming must not create a large time jump.
- Fit both desktop and narrow screens without cropping important tank sections or hiding all small animals. Resize camera projection, renderer, optical render targets, and relevant post-processing resources together.
- Remove development previews, axis helpers, collision outlines, model labels, debugging panels, and unused sample objects from the final view.

**Acceptance:** the aquarium is ready to open, explore, pause, inspect closely, and capture without UI clutter.

## Stage 16 — Optimize, Run, and Verify the Complete Project

- Aim for smooth interactive rendering, ideally near 60 fps on a capable laptop, without removing required animation, imported assets, collision behavior, or actual refraction.
- Instance repeated pebble geometry and share compatible resources. Cache bounds and collision proxies. Pool bubbles, particles, and ripple records.
- Avoid unnecessary per-frame allocation, geometry rebuilding, GLB reloads, or texture recreation. Update only animated data that actually changes.
- Cap device pixel ratio and scale costly optical targets appropriately. If adaptive quality is necessary, reduce particle density, shadow resolution, and refraction-target resolution before compromising the required animals or water behavior.
- Use conservative bounds for animated meshes, and verify material transparency/depth settings from multiple viewpoints. Check fins, snail contact through glass, bubble outlines, and refracted fish silhouettes especially carefully.
- Run the project and check asset loading, build output, shader compilation, network failures, and the browser console. Fix runtime errors and missing resources.
- Inspect the default view, both sides, the rear, and elevated views through the moving water. Test zoom/pan limits, touch-sized layout, pause/resume, resize, and returning after a hidden tab.
- Observe at least five minutes of normal movement and repeat representative paths under a deliberately reduced frame rate. Confirm safe fish separation, crab foot contact, snail attachment, and obstacle avoidance throughout.
- Verify stone extraction and inventory in code: three small source variants distributed as individual instances, exactly three large-rock placements, and no hidden duplicate source collections in the rendered scene.

Provide the working project, necessary prepared assets derived from the originals, a short run command, the actual filename-to-role mapping, and a brief account of any unavoidable limitations in the supplied geometry. Do not claim a check passed if it was not performed.

## Final Acceptance Checklist

- [ ] All required supplied GLB assets are used and their appearance is preserved; no replacement creature, plant, castle, filter, or stone models were procedurally generated.
- [ ] One large glass tank with visible thickness, open top, rim, frame, and a well-composed interior.
- [ ] A continuous sand bed with dense individually instanced pebbles from three extracted source variants.
- [ ] Exactly three distinct large rocks, each placed once after separation from its source collection.
- [ ] Exactly four fish, each using its own supplied model, with moving tails/fins and a distinct swimming personality.
- [ ] Fish never visibly touch or intersect one another, including their full animated fins and tails.
- [ ] Fish stay inside the water and avoid the substrate, glass, solid decorations, and other occupants.
- [ ] One imported crab walks predominantly sideways with articulated legs and believable foot contact.
- [ ] Two imported snails: one grounded on the bottom and one correctly attached to the inside front pane.
- [ ] Four imported plant specimens remain rooted and bend with different responses to current.
- [ ] One imported castle is grounded and its actual solid/open geometry is respected by navigation.
- [ ] One imported aerator has a connected thin airline hose exiting over the rear rim.
- [ ] Bubbles emerge from the real outlet, rise naturally, and generate ripples at the animated surface.
- [ ] Looking through moving surface waves visibly refracts the actual fish and submerged scenery.
- [ ] Reflections, depth tint, caustics, slight biological buildup, and suspended particles form a coherent, readable underwater environment.
- [ ] No opaque water, duplicated source triplets, detached fins, sliding crab, floating snail, obvious clipping, or unstable transparency.
- [ ] Responsive controls, correct full-simulation pause/resume, safe camera limits, reliable loading, and a clean runtime console.

## Final Quality Standard

Deliver a complete living aquarium built around the existing models. Its quality should come from successful asset integration, convincing articulation, spacious and reliable navigation, coupled bubble-and-wave behavior, actual water refraction, natural material response, and restrained signs of everyday aquarium life. The final experience should look beautiful at the default view and remain convincing when paused, zoomed in, or viewed through the rippling water.
