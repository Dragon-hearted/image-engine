/**
 * Vindof Mirror Walk v4 Storyboard Generator
 *
 * 13-scene rewrite using single composite character sheets (char-sheet-v4) and
 * gemini-3.1-flash-image-preview across ALL scenes (no tiered strategy).
 *
 * Differences vs v3:
 *   - ONE composite character sheet per character (not 6 per-view portraits).
 *   - Character-sheet imageIds are hardcoded (no manifest load).
 *   - All 13 scenes use gemini-3.1-flash-image-preview at 9:16 / 2K.
 *   - Symbolic reference labels resolved at runtime to imageIds. Env-anchor
 *     labels like "S02-env" are populated as upstream scenes finish.
 *   - Product detail scenes (07, 08, 10, 11) thread the PRODUCT REF FIRST in
 *     referenceImageIds so the garment is the strongest pixel anchor.
 *   - Per-scene retry (2x, 10s backoff) on transient failures; terminal
 *     failures are logged and do not abort the batch.
 *   - Output copied to assets-v4/ (v3 assets/ are not touched).
 *   - Generation log written as JSON to
 *     storyboards/airpods-swap-museum/generation-log-v4.json.
 *
 * Run from image-engine directory:
 *   cd systems/image-engine && bun scripts/generate-vindof-mirror-walk-v4.ts
 */

import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { insertImage, getImage, db } from "../src/db";
import { executeGeneration } from "../src/routes/generate";
import { applyBrandFlag } from "./lib/brand";

// Wrap executeGeneration so --brand is applied to every prompt transparently.
const generate: typeof executeGeneration = (args) =>
	executeGeneration({ ...args, prompt: applyBrandFlag(args.prompt) });

const STORYBOARD_DIR =
	"/Users/dragonhearted/Desktop/Adcelerate/systems/scene-board/clients/vindof/storyboards/airpods-swap-museum";
const ASSETS_DIR = `${STORYBOARD_DIR}/assets-v4`;
const LOG_PATH = `${STORYBOARD_DIR}/generation-log-v4.json`;
const MODEL = "gemini-3.1-flash-image-preview";

if (!existsSync("./uploads")) mkdirSync("./uploads");
if (!existsSync(ASSETS_DIR)) mkdirSync(ASSETS_DIR, { recursive: true });

const CHAR_A_SHEET_ID = "c3108268-46de-4343-8d66-9966bd54c495";
const CHAR_B_SHEET_ID = "28004f1e-7bc7-47e7-a5c0-e4c81aa15f95";

const PREAMBLE = `[STYLE ANCHOR] Cinematic editorial photograph. Premium streetwear brand. Refined modern museum plaza exterior — clean geometric facade, polished pale grey stone floor, floor-to-ceiling glass + brushed steel, empty plaza, no street clutter. Overcast diffused daylight, ~5500K, soft wrap, no hard shadows. Two Indian Gen Z males, fair skin, messy textured hair, 20-22. Desaturated cool slate palette with cream + sangria red accents. Shallow DoF, 85mm feel, Wong Kar-wai restraint, quiet maximalism. 9:16 vertical. Photorealistic.`;

const productImages = [
	{
		id: "vindof-lazy-bunch-shirt",
		path: `${STORYBOARD_DIR}/products/lazy-bunch-camp-shirt.jpg`,
		name: "Vindof The Lazy Bunch Cream Camp-Collar Shirt",
		mimeType: "image/jpeg",
	},
	{
		id: "vindof-red-dot-polo",
		path: `${STORYBOARD_DIR}/products/red-dot-polo.png`,
		name: "Vindof Red and White Dot-Pattern Knit Polo",
		mimeType: "image/png",
	},
];

interface SceneSpec {
	id: string;
	name: string;
	systemInstruction: string;
	prompt: string;
	referenceImageIds: string[];
	filename: string;
	dependsOn?: string;
}

const SCENES: SceneSpec[] = [
	{
		id: "01",
		name: "Empty Plaza Establishing",
		systemInstruction: `Cinematic editorial establishing shot. Wide 35mm locked-off frame, eye-level. Empty modern museum plaza exterior — no people, no cars, no street furniture, no signage. Polished pale grey stone, clean glass + brushed steel facade. Overcast diffused daylight, soft wrap, no hard shadows. Quiet maximalism. Photorealistic. 9:16 vertical.`,
		prompt: `${PREAMBLE}\n\n[SUBJECT] Empty plaza. No characters. No people in frame.\n[COMPOSITION] Wide 35mm locked-off master. Eye-level. Architecture occupies upper third. Plaza floor occupies lower two-thirds. Vertical mullion rhythm in the glass facade background. Symmetric framing.\n[LIGHTING] Overcast diffused daylight. Soft overhead wrap. No hard shadows. Pale cool cast.\n[MOOD] Anticipatory stillness before action.\n[CONSTRAINTS] No characters. No street furniture. No signage. No text in image.`,
		referenceImageIds: [],
		filename: "v4-scene-01-empty-plaza.png",
	},
	{
		id: "02",
		name: "Convergence Walk-in",
		systemInstruction: `Cinematic editorial wide shot. 35mm locked-off frame, eye-level, matches Scene 01 framing exactly. Two Indian Gen Z males walking toward each other on a horizontal collision path — Character A enters from screen-left walking screen-right, Character B enters from screen-right walking screen-left. Mirror-symmetric composition. Overcast daylight. Photorealistic. 9:16 vertical.`,
		prompt: `${PREAMBLE}\n\n[SUBJECT]\nCharacter A — Indian male, 20-22, white/fair skin tone, lean natural build, messy chestnut-brown textured hair with curtain bangs falling to eyebrows, soft jawline with light stubble, calm self-possessed expression. Wearing oversized Vindof THE LAZY BUNCH cream camp-collar short-sleeve button-up with red graffiti-style typography and three stylised character-head illustrations printed on front, worn slightly unbuttoned. Grey heather wide-leg baggy trousers, clean white low-top sneakers. Thin silver chain necklace. One white AirPod Pro in his left ear.\n\nCharacter B — Indian male, 20-22, white/fair skin tone, lean natural build, messy tousled dark brown/black waves slightly longer than Character A's style, sharper jawline, clean-shaven, subtle confident expression. Wearing Vindof red and white knit polo with a bold large-circle/dot grid pattern (deep sangria red dots on off-white ground), white ribbed collar, short sleeves, slightly loose fit. Black wide-leg baggy trousers, black leather loafers. Small gold hoop earring in his left ear. One white AirPod Pro in his right ear.\n\n[ACTION] Both characters mid-stride on a convergent horizontal path. Character A enters from the LEFT EDGE of frame walking SCREEN-RIGHT. Character B enters from the RIGHT EDGE of frame walking SCREEN-LEFT. They are about to collide at the exact horizontal center of the frame.\n[COMPOSITION] Wide 35mm locked-off master — match Scene 01 framing exactly. Eye-level. MIRROR-SYMMETRIC — Character A occupies the left third, Character B occupies the right third, dead plaza center between them. Trajectories are perpendicular to the camera axis.\n[LIGHTING] Overcast diffused daylight. Soft wrap. No hard shadows.\n[MOOD] Cinematic stillness. Quiet anticipation of impact.\n[CONSTRAINTS] Character A is on the LEFT half of the frame facing screen-right. Character B is on the RIGHT half of the frame facing screen-left. Do NOT swap their sides. No text in image.`,
		referenceImageIds: ["char-a-sheet", "char-b-sheet", "S01-env"],
		filename: "v4-scene-02-convergence-walkin.png",
		dependsOn: "01",
	},
	{
		id: "03",
		name: "The Bump (photoreal slow-mo)",
		systemInstruction: `Cinematic medium two-shot. 50mm. Photorealistic slow-motion shoulder bump at the exact horizontal center of the frame. Two Indian Gen Z males at the instant of impact — Character A on screen-left moving screen-right, Character B on screen-right moving screen-left. Visible shoulder compression, fabric ripples, four airborne AirPods with motion-blur trails, hair displacement, stone-dust puff at feet. Slight handheld jitter. Shallow DoF. Filmic grain. 9:16 vertical. Photorealistic.`,
		prompt: `${PREAMBLE}\n\n[SUBJECT]\nCharacter A — Indian male, 20-22, white/fair skin tone, lean natural build, messy chestnut-brown textured hair with curtain bangs falling to eyebrows, soft jawline with light stubble. Wearing oversized Vindof THE LAZY BUNCH cream camp-collar short-sleeve button-up with red graffiti-style typography and three stylised character-head illustrations printed on front, worn slightly unbuttoned. Grey heather wide-leg baggy trousers, clean white low-top sneakers. Thin silver chain necklace. One white AirPod Pro in his left ear.\n\nCharacter B — Indian male, 20-22, white/fair skin tone, lean natural build, messy tousled dark brown/black waves slightly longer than Character A's, sharper jawline, clean-shaven. Wearing Vindof red and white knit polo with bold large-circle dot grid pattern (deep sangria red dots on off-white ground), white ribbed collar, short sleeves, slightly loose fit. Black wide-leg baggy trousers, black leather loafers. Small gold hoop earring in his left ear. One white AirPod Pro in his right ear.\n\n[ACTION] Slow-motion shoulder impact at the EXACT horizontal center of the frame, rendered photoreal. Character A's RIGHT shoulder contacts Character B's LEFT shoulder with visible deltoid compression. Garment fabric ripples in concentric micro-folds across both shirts. Four white AirPod Pro earbuds are airborne, dislodged from both ears, arcing outward from the impact point with visible directional MOTION-BLUR trails — not perfectly suspended, they are in flight. Character A's curtain bangs swing back-up in a motion-blur arc; Character B's longer waves trail behind him in a motion-blur arc. Each torso micro-rotates in opposing directions — momentum as a subtle twist. A subtle puff of pale stone dust kicks up at both characters' feet.\n[COMPOSITION] Medium 2-shot. 50mm. Character A on the LEFT half of the frame facing SCREEN-RIGHT (right shoulder leading). Character B on the RIGHT half of the frame facing SCREEN-LEFT (left shoulder leading). Shoulders clip at the exact vertical center line. Slight handheld micro-jitter. Shallow DoF.\n[LIGHTING] Overcast diffused daylight. Soft wrap.\n[MOOD] Suspended kinetic moment. Felt impact weight. Filmic grain.\n[CONSTRAINTS] Character A is LEFT facing right. Character B is RIGHT facing left. Do NOT swap sides. AirPods are in flight with motion blur, NOT floating still. No text in image.`,
		referenceImageIds: ["char-a-sheet", "char-b-sheet", "S02-env"],
		filename: "v4-scene-03-bump.png",
		dependsOn: "02",
	},
	{
		id: "04",
		name: "AirPods Fall (overhead)",
		systemInstruction: `Top-down overhead static macro. 85mm. Four white AirPod Pro earbuds settled on polished pale grey stone. Two pairs of shoes visible at opposite frame edges — white low-top sneakers at TOP edge pointing screen-right, black leather loafers at BOTTOM edge pointing screen-left. Overcast light. Muted desaturated palette. Photorealistic. 9:16 vertical.`,
		prompt: `${PREAMBLE}\n\n[SUBJECT] Four white AirPod Pro earbuds on polished pale grey stone plaza floor. Two pairs of shoes visible at opposite frame edges — clean white low-top sneakers (Character A) at the TOP EDGE of frame, black leather loafers (Character B) at the BOTTOM EDGE of frame. No characters in full frame — only shoe tips and AirPods.\n[COMPOSITION] Top-down overhead static. 85mm macro. Camera looks straight down. AirPods clustered in an asymmetric quartet slightly LEFT-of-center. White sneaker toes at top edge point SCREEN-RIGHT (Character A's travel direction). Black loafer toes at bottom edge point SCREEN-LEFT (Character B's travel direction). Subtle stone texture visible.\n[LIGHTING] Overcast diffused daylight, flat top-down key. Soft shadows directly below the AirPods.\n[MOOD] Graphic beat-drop anticipation. White pods glowing on pale stone.\n[CONSTRAINTS] Shoe orientation preserves trajectories — sneakers point right, loafers point left. No faces. No hands. No text in image.`,
		referenceImageIds: ["S02-env"],
		filename: "v4-scene-04-airpods-fall.png",
		dependsOn: "02",
	},
	{
		id: "05",
		name: "Pickup Swap",
		systemInstruction: `Top-down close macro. 50mm. Two hands reaching diagonally into frame from opposite corners toward four AirPod Pro earbuds on polished pale grey stone. Cream camp-shirt graffiti sleeve enters from upper-right corner; red and white dot-pattern polo sleeve enters from lower-left corner. Overcast light. Shallow DoF. Photorealistic. 9:16 vertical.`,
		prompt: `${PREAMBLE}\n\n[SUBJECT] Two hands reaching diagonally into the overhead frame from opposite corners, each gripping an AirPod Pro earbud. Character A's hand enters from the UPPER-RIGHT corner — visible cream camp-collar shirt sleeve with red graffiti typography and stylised character-head illustrations. Character B's hand enters from the LOWER-LEFT corner — visible red and white dot-pattern knit polo sleeve (deep sangria red dots on off-white ground).\n[ACTION] Each hand grabs the WRONG pair — Character A picks up Character B's AirPods, Character B picks up Character A's. Quick unaware transaction.\n[COMPOSITION] Top-down overhead close crop. 50mm. Hands form an X across the frame diagonally. Sleeve patterns are the graphic anchor — viewer identifies each character by sleeve alone. AirPods positioned between the hands on pale stone. Shallow DoF on sleeve textures.\n[LIGHTING] Overcast daylight, flat top-down key. Soft shadows under hands.\n[CONSTRAINTS] A's cream+graffiti sleeve from UPPER-RIGHT. B's red+dots sleeve from LOWER-LEFT. Do NOT swap sleeve entry corners. No faces. No text in image.`,
		referenceImageIds: ["char-a-sheet", "char-b-sheet", "S04-env"],
		filename: "v4-scene-05-pickup-swap.png",
		dependsOn: "04",
	},
	{
		id: "06",
		name: "Character A Inserts Wrong Pair",
		systemInstruction: `85mm portrait close-up. Character A in 3/4 profile facing SCREEN-RIGHT (consistent with his L→R travel direction). Camera sees his LEFT cheek in 3/4 view. He is placing a single white AirPod Pro earbud into his LEFT ear. Museum plaza blurred behind. Soft overcast wrap light. Calm neutral pre-reaction expression. Cream camp-collar visible at neck. Shallow DoF. Photorealistic. 9:16 vertical.`,
		prompt: `${PREAMBLE}\n\n[SUBJECT]\nCharacter A — Indian male, 20-22, white/fair skin tone, lean natural build, messy chestnut-brown textured hair with curtain bangs falling to eyebrows, soft jawline with light stubble, calm self-possessed expression. Wearing oversized Vindof THE LAZY BUNCH cream camp-collar short-sleeve button-up worn slightly unbuttoned. Thin silver chain necklace. One white AirPod Pro earbud is being placed into his LEFT ear.\n\n[ACTION] Character A's right hand raises to his LEFT ear and places a single white AirPod Pro earbud into the ear canal. Neutral pre-reaction expression — he has NOT yet registered the music change. Calm, self-possessed.\n[COMPOSITION] 85mm portrait close-up. 3/4 profile — Character A's body and face are oriented toward SCREEN-RIGHT (consistent with his LEFT→RIGHT travel direction). Camera sees his LEFT cheek in 3/4 view. Head-and-shoulders framing. Museum plaza softly blurred in the background. Subtle dolly-in feel. Shallow DoF.\n[LIGHTING] Overcast diffused daylight, soft wrap from camera-left. Minimal contrast.\n[CONSTRAINTS] Character A faces SCREEN-RIGHT. AirPod is placed into LEFT ear. Calm neutral expression — do NOT show reaction or surprise. No text in image.`,
		referenceImageIds: ["char-a-sheet", "S02-env", "vindof-lazy-bunch-shirt"],
		filename: "v4-scene-06-a-inserts.png",
		dependsOn: "02",
	},
	{
		id: "07",
		name: "Beat Drop B Fit Detail 1",
		systemInstruction: `100mm macro close-up. Red and white knit polo fabric fills frame. Bold large-circle dot grid pattern — deep sangria red dots on off-white ground. Visible knit weave and fabric drape. Pattern preserved exactly as product reference. Museum plaza blurred far behind. Overcast diffused light. Slightly off-axis framing for graphic energy. Photorealistic. 9:16 vertical.`,
		prompt: `${PREAMBLE}\n\n[SUBJECT] MACRO of the Vindof red and white knit polo fabric only. No face. No hands. The frame is filled by the polo's pattern on Character B's torso.\n[PRODUCT ACCURACY — PRIMARY REFERENCE] The pattern MUST match the product photo exactly: bold large-circle dot grid, deep sangria red dots on an off-white knit ground. Circles are large (~4cm diameter scale on garment), evenly spaced in a grid, not small polka dots. Visible knit weave on the off-white ground. Fabric drape is soft with subtle vertical folds indicating it is on a body.\n[COMPOSITION] 100mm macro. Frame is rotated 5-10° off vertical for graphic energy. Dot grid fills the entire frame. Very tight crop — no collar, no seams, no hem visible, only the pattern surface. Plaza is blurred far in the background (shallow DoF, deep bokeh).\n[ACTION] Fabric breathes subtly — conveying that it is on a moving body. No hands or face in frame.\n[LIGHTING] Overcast diffused wrap. Subtle specular on the knit texture.\n[MOOD] Graphic beat-drop punch — audio swap made visible through pattern.\n[CONSTRAINTS] Pattern must match reference product EXACTLY — circle size, spacing, color saturation, knit texture. No face. No hands. No text in image.`,
		referenceImageIds: ["vindof-red-dot-polo", "char-b-sheet", "S02-env"],
		filename: "v4-scene-07-b-detail-1.png",
		dependsOn: "02",
	},
	{
		id: "08",
		name: "B Fit Detail 2",
		systemInstruction: `85mm tight crop. White ribbed collar meeting red-and-white dot-pattern knit polo, short-sleeve hem visible in upper-left corner. Subtle S-curve composition. No face. Product-accurate ribbed collar construction, pattern transition at the collar seam, and knit weave. Museum plaza blurred behind. Overcast wrap light. Photorealistic. 9:16 vertical.`,
		prompt: `${PREAMBLE}\n\n[SUBJECT] Tight crop of the Vindof red and white dot-pattern knit polo's collar region on Character B's neck and upper chest. No face. No hands.\n[PRODUCT ACCURACY — PRIMARY REFERENCE] White ribbed collar construction — visible vertical ribbing on the collar band. Pattern transition at the collar seam where the ribbed white band meets the dot-pattern body. Dot grid on the polo body below the collar. Visible knit weave. Top of chest and base of neck skin (fair Indian skin tone) in upper portion of frame.\n[COMPOSITION] 85mm tight crop. Soft S-curve composition — the collar curves diagonally across the frame. Short-sleeve hem tucks into the UPPER-LEFT corner of the frame. Button placket (if visible) runs vertically down from the collar. Shallow DoF, plaza blurred far behind.\n[LIGHTING] Overcast wrap light. Subtle contrast between ribbed white collar and dot-pattern body.\n[MOOD] Craft detail. Quiet maximalism — quality over loud.\n[CONSTRAINTS] No face shown. Collar construction must match reference product. No text in image.`,
		referenceImageIds: ["vindof-red-dot-polo", "char-b-sheet", "S07-env"],
		filename: "v4-scene-08-b-detail-2.png",
		dependsOn: "07",
	},
	{
		id: "09",
		name: "Character B Inserts Wrong Pair",
		systemInstruction: `85mm portrait close-up. Character B in 3/4 profile facing SCREEN-LEFT (consistent with his R→L travel direction). Camera sees his RIGHT cheek in 3/4 view. He is placing a single white AirPod Pro earbud into his RIGHT ear. Museum plaza blurred behind. Soft overcast wrap light. Calm neutral pre-reaction expression. Red polo collar visible at neck. Shallow DoF. Photorealistic. 9:16 vertical. Mirror-frames Scene 06.`,
		prompt: `${PREAMBLE}\n\n[SUBJECT]\nCharacter B — Indian male, 20-22, white/fair skin tone, lean natural build, messy tousled dark brown/black waves slightly longer than Character A's style, sharper jawline, clean-shaven, subtle confident expression. Wearing Vindof red and white knit polo with bold large-circle dot grid pattern (deep sangria red dots on off-white ground), white ribbed collar. Small gold hoop earring in his left ear. One white AirPod Pro earbud is being placed into his RIGHT ear.\n\n[ACTION] Character B's left hand raises to his RIGHT ear and places a single white AirPod Pro earbud into the ear canal. Neutral pre-reaction expression — he has NOT yet registered the music change. Calm, subtly confident.\n[COMPOSITION] 85mm portrait close-up. 3/4 profile — Character B's body and face are oriented toward SCREEN-LEFT (consistent with his RIGHT→LEFT travel direction). Camera sees his RIGHT cheek in 3/4 view. Mirror-frames Scene 06 exactly. Head-and-shoulders framing. Museum plaza softly blurred behind. Shallow DoF.\n[LIGHTING] Overcast diffused daylight, soft wrap from camera-right. Minimal contrast.\n[CONSTRAINTS] Character B faces SCREEN-LEFT. AirPod is placed into RIGHT ear. Calm neutral expression — do NOT show reaction or surprise. Mirror-frames Scene 06. No text in image.`,
		referenceImageIds: ["char-b-sheet", "S02-env", "vindof-red-dot-polo"],
		filename: "v4-scene-09-b-inserts.png",
		dependsOn: "02",
	},
	{
		id: "10",
		name: "Beat Drop A Fit Detail 1",
		systemInstruction: `100mm macro close-up. Cream camp-collar shirt front panel fills frame. Red graffiti-style spray-paint typography reading THE LAZY BUNCH plus three stylised illustrated character-head portraits printed on the front. Typography and illustrations must match product reference EXACTLY — spelling, spray texture, character-head positions, faces, style. Frame slightly off-axis. Plaza blurred far behind. Photorealistic. 9:16 vertical.`,
		prompt: `${PREAMBLE}\n\n[SUBJECT] MACRO of the Vindof THE LAZY BUNCH camp-collar shirt's printed front panel on Character A's torso only. No face. No hands. The frame is filled by the shirt's graffiti print and illustrated character heads.\n[PRODUCT ACCURACY — PRIMARY REFERENCE] The printed design MUST match the product photo exactly. Elements on the shirt, in order:\n1. Red spray-paint graffiti-style typography reading "THE LAZY BUNCH" (EXACT spelling, exact spray texture, exact typography style — deep oxblood red on cream fabric).\n2. Three stylised illustrated character-head portraits — match the product reference exactly for position, style, facial features of the illustrated heads, and line weight.\nThe print is a physical garment graphic, not an overlay. Cream fabric base color. Subtle fabric wash/distress texture.\n[COMPOSITION] 100mm macro. Frame rotated 5-10° off vertical for graphic energy. The full printed composition (typography + 3 heads) fills the frame. Very tight crop — camp-collar edge barely visible at top. No face. No hands. Plaza far blurred (deep bokeh).\n[ACTION] Cream fabric breathes subtly — indicates it is on a moving body.\n[LIGHTING] Overcast diffused wrap. No harsh reflections on the print.\n[MOOD] Graphic beat-drop re-entry. Audio re-swap made visible through the shirt art.\n[CONSTRAINTS] The printed "THE LAZY BUNCH" text is PHYSICAL GARMENT PRINT and is the only scene where text in image is permitted — it MUST match the product reference photo exactly. Spelling: THE LAZY BUNCH. No other text. No overlay graphics. No faces. No hands.`,
		referenceImageIds: ["vindof-lazy-bunch-shirt", "char-a-sheet", "S02-env"],
		filename: "v4-scene-10-a-detail-1.png",
		dependsOn: "02",
	},
	{
		id: "11",
		name: "A Fit Detail 2",
		systemInstruction: `85mm tight crop. Cream camp-collar curve, top button undone, interior woven VINDOF neck label just visible at the inside neckline. Washed cream fabric texture with subtle distress. Museum plaza blurred behind. Overcast wrap light. Subtle composition. Label text is physical woven garment detail, not overlay. Spelling: VINDOF. Photorealistic. 9:16 vertical.`,
		prompt: `${PREAMBLE}\n\n[SUBJECT] Tight crop of the Vindof cream camp-collar shirt's collar and top-button region on Character A's neck and upper chest. No face. No hands.\n[PRODUCT ACCURACY — PRIMARY REFERENCE] Camp-collar curves diagonally across the frame. Top button is undone. Interior woven "VINDOF" neck label is visible on the inside of the collar — physical brand tag, match reference exactly (label shape, typography, stitching). Cream fabric has subtle wash/distress texture. Top of chest and base of neck skin (fair Indian skin tone) in lower portion of frame.\n[COMPOSITION] 85mm tight crop. Collar curve runs diagonally from upper-left to lower-right. Top button undone, button placket visible. Interior neck label peeks out at the back of the collar. Shallow DoF, plaza far blurred.\n[LIGHTING] Overcast wrap light. Subtle shadow under collar curve.\n[MOOD] Quiet craft detail — brand moment revealed subtly, not shouted.\n[CONSTRAINTS] Interior "VINDOF" neck label is physical garment detail — match product reference exactly. Only scene besides Scene 10 where physical garment text is permitted. Spelling: VINDOF. No face shown. No overlay text.`,
		referenceImageIds: ["vindof-lazy-bunch-shirt", "char-a-sheet", "S10-env"],
		filename: "v4-scene-11-a-detail-2.png",
		dependsOn: "10",
	},
	{
		id: "12",
		name: "Handoff GROUNDED",
		systemInstruction: `85mm close-up. Two hands meeting at chest level in the center of frame, exchanging white AirPod Pro earbuds palm-to-palm. CRITICAL: the composition includes the PLAZA FLOOR AND LOWER LEGS — lower third of frame shows pale grey stone floor + both characters' lower legs, ankles, and shoes. Upper two-thirds show the hands exchange at chest level. Cream graffiti sleeve from screen-left; red dot polo sleeve from screen-right. Overcast wrap. Shallow DoF. Photorealistic. 9:16 vertical.`,
		prompt: `${PREAMBLE}\n\n[SUBJECT] Two hands meeting at the horizontal center of the frame at chest level, exchanging white AirPod Pro earbuds palm-to-palm. Character A's hand enters from SCREEN-LEFT — visible cream camp-collar shirt sleeve with red graffiti typography. Character B's hand enters from SCREEN-RIGHT — visible red and white dot-pattern polo sleeve.\n[GROUNDING — CRITICAL COMPOSITION RULE] The shot MUST be visually grounded with the plaza floor in frame. The frame is divided into thirds:\n- LOWER THIRD: polished pale grey stone plaza floor. Both characters' lower legs, ankles, and shoes are visible — Character A's grey heather wide-leg trouser hem + clean white low-top sneakers on the LEFT side of frame; Character B's black wide-leg trouser hem + black leather loafers on the RIGHT side of frame. The stone floor is the reference plane.\n- UPPER TWO-THIRDS: the hands exchange at chest level in the center, on a soft-focus background of the blurred plaza and glass facade.\nDo NOT show the hands floating in a void — the floor and shoes must be visible in the lower third of the frame.\n[ACTION] AirPods pass palm-to-palm between the two hands. Silent, unspoken exchange.\n[COMPOSITION] 85mm. Vertical 9:16 frame. Hands meeting at chest level in the center (upper 2/3). Floor + shoes in lower 1/3. Slight dolly-in feel. Shallow DoF on plaza background.\n[LIGHTING] Overcast wrap light. Consistent top-down.\n[MOOD] Silent craft transaction. Both Vindof pieces framed as visual equals. The handoff IS the reaction beat — no separate realization shot.\n[CONSTRAINTS] Character A's cream+graffiti sleeve enters from SCREEN-LEFT. Character B's red+dots sleeve enters from SCREEN-RIGHT. Lower third of frame MUST include the plaza floor, lower legs, and both characters' shoes. Do NOT show floating hands in a blank void. No faces. No text in image.`,
		referenceImageIds: ["char-a-sheet", "char-b-sheet", "S05-env"],
		filename: "v4-scene-12-handoff.png",
		dependsOn: "05",
	},
	{
		id: "13",
		name: "Walk Away DIVERGENT",
		systemInstruction: `Wide 35mm locked-off. Matches Scene 02 framing exactly. Both Indian Gen Z males walking AWAY FROM EACH OTHER IN OPPOSITE DIRECTIONS. Character A in the RIGHT third of frame walking toward the RIGHT edge (3/4 rear). Character B in the LEFT third of frame walking toward the LEFT edge (3/4 rear). Plaza negative space dominates center. CRITICAL: they move APART, NOT together. Do NOT render both walking to the same side. Overcast wrap. Photorealistic. 9:16 vertical.`,
		prompt: `${PREAMBLE}\n\n[SUBJECT]\nCharacter A — Indian male, 20-22, white/fair skin tone, lean natural build, messy chestnut-brown hair with curtain bangs, soft jawline, light stubble. Oversized Vindof THE LAZY BUNCH cream camp-collar short-sleeve shirt (graffiti print visible on the back less, but the cream body + collar visible). Grey heather wide-leg baggy trousers. Clean white low-top sneakers.\n\nCharacter B — Indian male, 20-22, white/fair skin tone, lean natural build, messy tousled dark brown/black waves, sharper jawline, clean-shaven. Vindof red and white dot-pattern knit polo (dot grid pattern wraps to the back — deep sangria red dots on off-white ground continuing on back panel). Black wide-leg baggy trousers. Black leather loafers.\n\n[ACTION — DIVERGENT MOTION — CRITICAL] The two characters walk in OPPOSITE DIRECTIONS — they are moving APART. Character A moves toward the RIGHT edge of the frame. Character B moves toward the LEFT edge of the frame. They walk AWAY FROM EACH OTHER. Do NOT show both characters moving toward the same side of the frame. Do NOT show them walking together. This is the walk-away bookend — each continues the path he started in Scene 02.\n\n[COMPOSITION] Wide 35mm locked-off frame. Matches Scene 02 framing EXACTLY (same camera position, same focal length, same eye-level). Character A occupies the RIGHT THIRD of frame, back to camera, 3/4 rear angle, right flank toward camera, stepping toward the right edge. Character B occupies the LEFT THIRD of frame, back to camera, 3/4 rear angle, left flank toward camera, stepping toward the left edge. Wide plaza negative space dominates the CENTER of frame between them. MIRROR-SYMMETRIC composition but DIVERGENT MOTION.\n[LIGHTING] Overcast diffused daylight. Soft wrap. Consistent with Scene 01/02.\n[MOOD] Quiet close. Each character continues the path he started — story ends as quietly as it began.\n[CONSTRAINTS — READ CAREFULLY]\n1. Character A is in the RIGHT third of frame walking RIGHT (away from center, toward the right edge).\n2. Character B is in the LEFT third of frame walking LEFT (away from center, toward the left edge).\n3. They move in OPPOSITE directions — apart, not together.\n4. Do NOT render both characters walking toward the same side.\n5. Do NOT render them side-by-side walking together.\n6. Plaza negative space dominates the center third of the frame.\n7. 3/4 rear angles — back of heads visible, faces not shown.\n8. No text in image.`,
		referenceImageIds: ["char-a-sheet", "char-b-sheet", "S02-env"],
		filename: "v4-scene-13-walk-away.png",
		dependsOn: "02",
	},
];

const envMap = new Map<string, string>();

const staticLabelMap: Record<string, string> = {
	"char-a-sheet": CHAR_A_SHEET_ID,
	"char-b-sheet": CHAR_B_SHEET_ID,
	"vindof-lazy-bunch-shirt": "vindof-lazy-bunch-shirt",
	"vindof-red-dot-polo": "vindof-red-dot-polo",
};

function resolveRefs(labels: string[], sceneId: string): string[] {
	const resolved: string[] = [];
	for (const label of labels) {
		if (staticLabelMap[label]) {
			resolved.push(staticLabelMap[label]);
			continue;
		}
		if (label.endsWith("-env")) {
			const key = label;
			const id = envMap.get(key);
			if (id) {
				resolved.push(id);
			} else {
				console.warn(
					`  ⚠ Scene ${sceneId}: env anchor "${label}" not available — dropping ref.`,
				);
			}
			continue;
		}
		console.warn(
			`  ⚠ Scene ${sceneId}: unknown reference label "${label}" — dropping.`,
		);
	}
	return resolved;
}

function findImageIdByGeneration(genId: string): string {
	const row = db
		.prepare("SELECT id FROM images WHERE filename LIKE ?")
		.get(`${genId}%`) as { id: string } | null;
	if (!row) throw new Error(`No image found for generation ${genId}`);
	return row.id;
}

function copyToAssets(genId: string, filename: string): string {
	const srcPng = `./uploads/${genId}.png`;
	const srcJpg = `./uploads/${genId}.jpg`;
	const src = existsSync(srcPng) ? srcPng : srcJpg;
	const dest = `${ASSETS_DIR}/${filename}`;
	copyFileSync(src, dest);
	return dest;
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

interface RunOutcome {
	id: string;
	name: string;
	filename: string;
	model: string;
	imageId?: string;
	generationId?: string;
	tokens?: number;
	error?: string;
	referenceImageIds: string[];
}

const outcomes: RunOutcome[] = [];

console.log("═══ Importing product reference images ═══\n");
for (const p of productImages) {
	if (getImage(p.id)) {
		console.log(`  ✓ ${p.name} already imported (${p.id})`);
		continue;
	}
	const file = Bun.file(p.path);
	if (!(await file.exists())) {
		console.error(`  ✗ File not found: ${p.path}`);
		process.exit(1);
	}
	const size = file.size;
	insertImage({
		id: p.id,
		filename: p.path.split("/").pop()!,
		originalName: p.name,
		path: p.path,
		mimeType: p.mimeType,
		size,
		createdAt: new Date().toISOString(),
	});
	console.log(`  ✓ Imported ${p.name} (${p.id})`);
}

console.log(
	`\n═══ Verifying character sheet images ═══\n  char-a: ${CHAR_A_SHEET_ID}\n  char-b: ${CHAR_B_SHEET_ID}\n`,
);
for (const id of [CHAR_A_SHEET_ID, CHAR_B_SHEET_ID]) {
	const img = getImage(id);
	if (!img) {
		console.error(`  ✗ Character sheet image NOT FOUND in DB: ${id}`);
		process.exit(1);
	}
	console.log(`  ✓ ${id} → ${img.path}`);
}

async function runSceneWithRetry(
	scene: SceneSpec,
	resolvedRefs: string[],
): Promise<{ genId: string; imageId: string; tokens: number }> {
	const MAX_ATTEMPTS = 3;
	let lastErr: unknown;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const gen = await generate({
				prompt: scene.prompt,
				systemInstruction: scene.systemInstruction,
				referenceImageIds: resolvedRefs,
				aspectRatio: "9:16",
				imageSize: "2K",
				forceImage: true,
				model: MODEL,
				sceneId: `scene-${scene.id}-v4`,
			});
			const imageId = findImageIdByGeneration(gen.id);
			return {
				genId: gen.id,
				imageId,
				tokens: gen.tokenUsage.totalTokens,
			};
		} catch (err) {
			lastErr = err;
			const msg = (err as Error).message ?? String(err);
			console.warn(
				`  ⚠ Attempt ${attempt}/${MAX_ATTEMPTS} failed for scene ${scene.id}: ${msg}`,
			);
			if (attempt < MAX_ATTEMPTS) {
				console.warn("  waiting 10s before retry...");
				await sleep(10_000);
			}
		}
	}
	throw lastErr;
}

console.log("\n═══ Generating scenes sequentially ═══\n");

for (const scene of SCENES) {
	console.log(
		`\n── Scene ${scene.id} — ${scene.name} ──\n  dependsOn: ${scene.dependsOn ?? "(none)"}`,
	);
	const resolved = resolveRefs(scene.referenceImageIds, scene.id);
	console.log(
		`  refs (${resolved.length}): [${scene.referenceImageIds.join(", ")}] → [${resolved.join(", ") || "(none)"}]`,
	);

	try {
		const result = await runSceneWithRetry(scene, resolved);
		copyToAssets(result.genId, scene.filename);
		envMap.set(`S${scene.id}-env`, result.imageId);
		outcomes.push({
			id: scene.id,
			name: scene.name,
			filename: scene.filename,
			model: MODEL,
			imageId: result.imageId,
			generationId: result.genId,
			tokens: result.tokens,
			referenceImageIds: resolved,
		});
		console.log(
			`  ✓ Scene ${scene.id} done — genId=${result.genId}, imageId=${result.imageId}, tokens=${result.tokens}`,
		);
	} catch (err) {
		const msg = (err as Error).message ?? String(err);
		console.error(`  ✗ Scene ${scene.id} FAILED terminally: ${msg}`);
		outcomes.push({
			id: scene.id,
			name: scene.name,
			filename: scene.filename,
			model: MODEL,
			error: msg,
			referenceImageIds: resolved,
		});
	}
}

const totalTokens = outcomes.reduce((s, o) => s + (o.tokens ?? 0), 0);
const successCount = outcomes.filter((o) => !o.error).length;
const failCount = outcomes.length - successCount;

console.log("\n═══════════════════════════════════════════════");
console.log("  VINDOF MIRROR WALK v4 — GENERATION COMPLETE");
console.log("═══════════════════════════════════════════════\n");
console.log(`Model: ${MODEL}`);
console.log(`Success: ${successCount}/${SCENES.length}`);
console.log(`Failed: ${failCount}`);
console.log(`Total tokens: ${totalTokens}\n`);

console.log("| Scene | Status | Generation ID | Image ID | Tokens | File |");
console.log("|-------|--------|---------------|----------|--------|------|");
for (const o of outcomes) {
	const status = o.error ? "FAIL" : "OK";
	console.log(
		`| ${o.id} ${o.name} | ${status} | ${o.generationId ?? "-"} | ${o.imageId ?? "-"} | ${o.tokens ?? 0} | ${o.filename} |`,
	);
}
if (failCount > 0) {
	console.log("\n── Failures ──");
	for (const o of outcomes.filter((x) => x.error)) {
		console.log(`  ✗ Scene ${o.id}: ${o.error}`);
	}
}
console.log(`\nAssets copied to: ${ASSETS_DIR}/`);

const logOutput = {
	version: "v4",
	model: MODEL,
	aspectRatio: "9:16",
	imageSize: "2K",
	charASheetId: CHAR_A_SHEET_ID,
	charBSheetId: CHAR_B_SHEET_ID,
	totalScenes: SCENES.length,
	successCount,
	failCount,
	totalTokens,
	scenes: outcomes,
};
await Bun.write(LOG_PATH, JSON.stringify(logOutput, null, 2));
console.log(`Generation log saved to: ${LOG_PATH}`);
