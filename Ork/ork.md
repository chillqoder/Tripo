Build a complete, runnable Three.js project using the two supplied GLB assets: an orc character and a separate axe.

Create an interactive fantasy scene featuring a massive, angry orc standing in a grassy forest clearing, holding the axe in his anatomical RIGHT hand.

The main priorities are convincing full-body skeletal animation, anatomically believable weapon handling, a visible sense of weight, and synchronized game audio.

Use the supplied models. Preserve their appearance, textures, armor, and proportions.

## MANDATORY WORKFLOW

Implement the project in the stages below. Complete and verify each stage before proceeding.

Do not build the entire environment first and postpone character rigging, weapon alignment, or finger posing until the end.

Use a simple temporary ground plane while developing the character animations. Complete the final forest environment after the character and weapon mechanics work correctly.

The project requires TWO SEPARATE GRIP INSPECTIONS:

1. A static inspection after establishing the standing pose and axe grip.
2. A dynamic inspection after implementing idle and all three action animations.

If either inspection reveals a problem, correct it and repeat the inspection before proceeding.

## STAGE 1 — INSPECT THE ASSETS AND PREPARE THE CHARACTER RIG

Before implementing animations, inspect both GLB files:

- Dimensions and relative scale.
- Model orientation and transforms.
- Object hierarchy.
- Skeleton and bone names.
- Skin weights.
- Existing animation clips.
- Finger articulation.
- Jaw controls and morph targets.
- Materials and texture assignments.

Do not assume that the character is rigged merely because it is in a T-pose.

If a usable skeleton exists, use it. If the skeleton is incomplete, add the missing controls and skinning.

If the character is unrigged, create a proper skeleton and skin weights using available asset-processing tools, such as a scripted Blender workflow. Export a prepared GLB for use in the project.

The rig must support convincing movement of the pelvis, spine, chest, neck, head, shoulders, elbows, wrists, fingers, thumbs, hips, knees, and ankles.

Provide a jaw bone or suitable morph target for breathing, growling, and roaring. If the existing mesh needs additional preparation for jaw movement, perform it while preserving the character’s appearance.

The animation must deform the actual character mesh. Moving the entire rigid model, rotating disconnected body parts, or leaving the hands in their original open pose is not an acceptable substitute for skeletal animation.

Verify the rig before proceeding.

## STAGE 2 — NORMALIZE SCALE AND FIT THE AXE TO THE ORC

Normalize both models into a consistent coordinate system. Calculate their bounding boxes before positioning them.

Keep the orc’s feet on the ground.

Adjust the axe to the orc’s actual proportions. Do not trust the original GLB scale.

Choose an appropriate uniform scale based on:

- The orc’s height and build.
- Arm length and reach.
- Palm dimensions.
- Finger length.
- Axe handle thickness.
- Clearance around the legs, torso, and ground.

The axe should look large, heavy, and powerful while remaining believable as a one-handed weapon.

The handle must fit inside the closed hand. The fingers must be able to wrap around it without extreme stretching or excessive intersection.

Preserve the axe’s original proportions. Avoid nonuniform scaling that distorts the head or handle.

Use the lower-to-middle section of the handle as a practical one-handed grip, leaving some handle extending below the fist. Refine this placement according to the actual geometry and balance of the supplied axe.

Establish the final relative scale before calibrating the weapon attachment.

## STAGE 3 — CREATE THE STANDING POSE AND AXE GRIP

RIGHT always means the orc’s anatomical right side, not the viewer’s right side. When the orc is viewed from the front, his right hand appears on the left side of the screen.

Create this default stance:

- Feet slightly wider than shoulder width.
- One foot slightly ahead of the other.
- Knees gently bent.
- A heavy, grounded posture.
- Weight distributed naturally between both legs.
- Torso leaning forward slightly.
- Broad, tense shoulders.
- Head facing forward with an angry expression.
- Left hand loosely clenched near his side.

The right arm hangs beside the body with a slightly bent elbow, holding the axe in a low-ready position.

The handle extends diagonally forward and downward from the right hand. The axe head stays outside the right leg, with the cutting edge directed away from the body and enough clearance above the ground.

Create a weapon attachment socket on the right-hand bone. Calibrate the axe’s local position and rotation so that its handle sits correctly inside the grip.

Treat the axe as a rigid object attached to the hand. It must follow the hand without slipping, lagging, stretching, or changing scale.

### Required finger and thumb positioning

The grip must be anatomically convincing:

- The handle passes through the center of the closed palm.
- The index, middle, ring, and little fingers curl naturally around the handle.
- Finger joints bend progressively into a firm grip.
- The thumb opposes the fingers and wraps around the other side of the handle.
- The thumb closes against the grip in a believable position.
- The palm and fingers visibly contact the handle.
- The wrist remains reasonably aligned with the forearm.

Do not place the axe beside an open hand. Do not push the handle through a closed fist without adjusting the fingers.

Avoid floating fingers, excessive mesh intersections, backward-bending joints, an outstretched thumb, or a thumb buried inside the handle.

### GRIP INSPECTION #1 — STATIC

Inspect the standing pose close-up from:

- The palm side.
- The back of the hand.
- Both sides of the grip.
- An angle that clearly reveals the thumb.

Explicitly check the thumb and each of the four fingers individually.

Confirm that the grip looks correct from multiple angles, the wrist is natural, and the axe clears the body and ground.

A fist that looks approximately correct from a distant camera is not sufficient.

Correct every visible issue before proceeding.

## STAGE 4 — CREATE THE CONTINUOUS IDLE ANIMATION

The orc must feel enormous, heavy, angry, and alive even when no action is playing.

Create a seamless idle loop featuring:

- Clearly visible, slow, heavy breathing.
- Coordinated movement in the chest, upper spine, abdomen, and shoulders.
- Slight head movement following the breathing rhythm.
- Small weight shifts between the legs.
- Subtle knee flexion and extension.
- Restrained body sway.
- Small right-arm and axe movements caused by breathing.
- Occasional jaw movement, as if he is growling or clenching his mouth.

Heavy breathing must be readable from the default camera distance. Convey it through coordinated skeletal movement and, where available, suitable deformation controls. Do not simply scale the entire character up and down.

Keep both feet planted without unintended sliding.

Maintain a firm, stable axe grip throughout the loop.

Add low breathing and occasional quiet growls once the audio system is implemented.

## STAGE 5 — BUILD THE THREE ACTION ANIMATIONS

Implement and test these actions one at a time.

Complete each action’s body mechanics, weapon movement, timing, and return to idle before beginning the next.

### ACTION 1 — RAISE THE AXE AND ROAR

Create an approximately FIVE-SECOND intimidation animation.

The orc raises the axe overhead with his RIGHT hand and roars aggressively, performing two or three emphatic upward weapon pumps.

Movement sequence:

1. He bends his knees slightly and braces his body.
2. His torso straightens as the right shoulder and elbow lift the axe overhead.
3. His chest expands, his head tilts slightly upward, and his jaw opens for the roar.
4. He performs several distinct upward pumps, with small downward recoveries between them.
5. He lowers the axe and returns smoothly to idle.

Animate the pelvis, spine, shoulders, neck, jaw, arms, and knees together.

The axe must feel heavy. Use visible acceleration, deceleration, and brief pauses instead of constant-speed mechanical movement.

Synchronize roars with the open jaw and strongest gestures.

### ACTION 2 — BEAT HIS CHEST

Create an approximately FIVE-SECOND chest-beating animation.

The axe remains securely in the RIGHT hand, held low and away from the body.

The LEFT hand closes into a fist and strikes the upper chest three times.

Each strike needs:

1. A visible backward preparation.
2. A forceful forward movement.
3. Clear contact between the fist and chest.
4. A small reaction through the chest, spine, shoulders, and head.
5. A brief recoil before the next strike.

Keep the motion anatomically reachable. Avoid excessive penetration into the chest or armor.

The right arm should stabilize the axe naturally as the torso reacts to the chest strikes.

Add deep chest-impact thumps precisely at contact. Include angry grunts, short roars, and matching jaw movement.

Finish by lowering the left arm and blending back into idle.

### ACTION 3 — OVERHEAD AXE GROUND SLAM

Create a powerful full-body overhead strike lasting approximately FOUR TO FIVE SECONDS, including preparation, impact, recovery, and return to idle.

The axe remains in the RIGHT hand throughout the action.

#### Preparation

- He braces or slightly widens his stance.
- His knees bend and hips lower.
- His weight shifts in preparation.
- The right arm raises the axe above and slightly behind his head.
- The torso extends and rotates slightly.
- The left arm moves naturally to help balance the body.

#### Downward strike

- The hips and torso initiate and drive the movement.
- The spine bends forward progressively.
- The right shoulder, elbow, and wrist guide the axe through a continuous overhead arc.
- The knees flex and weight moves forward.
- The axe accelerates toward the ground with a strong sense of mass.

This must be a coordinated full-body strike, not an isolated arm rotation.

#### Impact

The cutting edge hits a partially exposed rock embedded in the ground in front of the orc.

Calculate the contact point using the blade’s world-space position and the target surface. Adjust the pose and trajectory so the blade reaches the intended surface accurately.

Stop the axe at the contact surface instead of letting it pass through the ground.

Include a brief impact hold and a strong reaction through the arms, shoulders, spine, hips, and knees.

#### Recovery

- He pulls the axe free.
- His torso rises.
- His knees gradually straighten.
- His right arm returns the axe to the low-ready position.
- He settles into heavy breathing.

Keep his feet grounded. If a foot needs to move, animate a deliberate step instead of allowing it to slide.

#### Impact effects

Add:

- A short burst of sparks from the metal blade striking stone.
- Dust.
- Small stone fragments.
- A brief, subtle camera shake.
- A small temporary impact mark or ground disturbance.
- A fast weapon whoosh during the downward swing.
- A heavy stone-and-metal impact sound at the exact contact moment.

All effects must originate at the actual blade contact point.

Keep the effects short and readable so they do not obscure the character.

## STAGE 6 — GRIP INSPECTION #2 DURING ALL ANIMATIONS

After idle and all three actions are implemented, perform a second, separate inspection of the right hand and axe during motion.

Play the animations slowly and examine representative frames, including:

- The idle breathing extremes.
- The highest overhead position.
- Every upward weapon pump.
- Each chest strike.
- The beginning and middle of the downward axe swing.
- The exact ground-impact frame.
- The extraction and recovery.
- Transitions into and out of idle.

Inspect the thumb and all four fingers again from multiple close-up angles.

Verify that:

- The fingers remain naturally wrapped around the handle.
- The thumb maintains a believable opposing grip.
- The handle stays seated in the palm.
- The hand does not open accidentally.
- The axe does not slip or drift relative to the hand.
- The wrist does not twist into an impossible position.
- Finger and handle intersections remain minimal.
- The axe does not pass through the body.

Keep the weapon rigidly attached to the right-hand socket. Achieve the swing through coordinated body, arm, and wrist movement instead of independently rotating the axe out of the grip.

Correct any issues and repeat this inspection before proceeding.

## STAGE 7 — BUILD THE FINAL FOREST CLEARING

Replace the temporary test ground with a small, natural forest clearing.

Include:

- A patch of slightly uneven earth beneath the character.
- Visible dirt under his feet.
- Grass clumps around the clearing.
- A few stones and small ground details.
- A partially exposed rock at the established axe-impact location.
- Trees and foliage in the background.
- Soft daylight and natural shadows.
- Subtle atmospheric depth.
- Gentle movement in some grass and foliage.

Keep the environment restrained. The orc and axe are the visual focus.

Leave enough open space for every action. Preserve the established foot placement and impact surface when adding terrain details.

Avoid grass or foliage obscuring the hand, weapon, or ground impact.

## STAGE 8 — ADD REQUIRED GAME AUDIO AND LOCAL ASSETS

Sound is required.

Find suitable legally reusable game sound effects online, or generate them yourself. Save the final audio files inside the project, for example in public/assets/audio/.

Include:

- Heavy breathing.
- Low growls.
- Several roar and grunt variations.
- Chest-hit thumps.
- Axe-swing whooshes.
- A heavy axe impact.
- Quiet forest ambience.

Do not depend on remote audio URLs at runtime.

If externally sourced audio is used, include source links and license information in an asset credits file.

Synchronize sounds with specific animation events:

- Breathing follows the idle breathing rhythm.
- Roars align with jaw opening.
- Chest thumps occur at fist contact.
- The weapon whoosh follows the fast part of the swing.
- The ground-impact sound occurs exactly when the blade hits the surface.

Do not start every sound at the beginning of an action.

Use subtle variation where appropriate to avoid identical repeated grunts or impacts.

Enable audio after the first user interaction to respect browser autoplay restrictions. Include a visible mute control.

Balance the mix so that forest ambience remains quiet behind the character sounds.

## STAGE 9 — CAMERA, INTERFACE, AND ANIMATION CONTROL

Use a slightly elevated front three-quarter camera angle that clearly shows:

- The orc’s face.
- The right-hand axe grip.
- The full weapon.
- The ground-impact area.

Frame the entire character and keep the axe visible when raised overhead.

Allow restrained orbit and zoom controls.

Add three clearly labeled buttons along the bottom:

- “Raise Axe & Roar”
- “Beat Chest”
- “Ground Slam”

Support keyboard shortcuts 1, 2, and 3.

Play one action at a time. Prevent repeated inputs from stacking animations, impact effects, or sounds.

Blend smoothly from idle into each action and back into idle.

Use a clear animation state system. If procedural animation and animation clips are combined, control which system owns each bone so idle and action updates do not overwrite one another unpredictably.

Use proper blending or animation layers where needed.

## STAGE 10 — FINAL TESTING AND DELIVERY

Use delta-time-based animation for consistent timing across frame rates.

Handle loading, resizing, and asset errors cleanly.

Keep particles efficient. Reuse or dispose of temporary effects so repeated actions do not cause growing memory usage.

Run the completed project and test every action at normal speed and in slow motion.

Verify that:

- The original supplied models are used.
- The axe is scaled appropriately to the orc.
- The axe is held in the anatomical RIGHT hand.
- The thumb and all four fingers visibly form a natural grip.
- Both required grip inspections have passed.
- The axe remains correctly attached during every movement.
- Heavy breathing, jaw movement, and knee movement are visible.
- All three actions involve coordinated full-body animation.
- The left hand performs the chest strikes.
- The axe blade contacts the intended ground surface.
- Audio, sparks, dust, and camera shake occur at the correct moments.
- The camera keeps the complete action visible.
- Every action returns smoothly to idle.
- Repeated actions remain stable.

Deliver the complete runnable project, including:

- Source code.
- Prepared GLB models.
- Required textures.
- Local audio assets.
- Asset credits where applicable.
- Clear setup and run instructions.

In the delivery notes, briefly state how the axe scale was adjusted and what was checked during both grip inspections. Only report verification that was actually performed.

Build and test the actual interactive experience, not merely a static scene or an implementation outline.