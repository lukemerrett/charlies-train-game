# Charlie's Spooky Train

A mouse-driven 3D Halloween model railway, made for a 3½-year-old.

**Play it:** https://lukemerrett.github.io/charlies-train-game/

## How to play

- **Green ▶**: go!
- **Red ■**: stop. Press it as the next station comes up (the button pulses and the station's mascot bounces), and the train glides to the platform.
- **Purple ghost**: the spooky ghost whistle. Whoo-oooo!

The camera follows the train from above at an angle, like looking down at a model railway on a table. The button in the top-left corner zooms out to show the whole layout, and pressing it again zooms back in. On a phone held sideways, the big buttons move to the right-hand side.

The track winds a long way round the board, through a tunnel and over a river. There are twelve stations, each with its own mascot floating above it:

1. Pumpkin Patch
2. Haunted House
3. Witch Wood
4. Bat Castle
5. Spider Hollow
6. Skeleton Square
7. Cauldron Corner
8. Owl Tower
9. Black Cat Cottage
10. Monster Mill
11. Moonlight Halt
12. Candy Corner

At each station, passengers (ghosts, witches, vampires, black cats, monsters, mummies, skeletons and pumpkin-heads) hop off and new ones hop on. Click someone on the platform to put them on the train, or click a passenger to let them off.

Lots of things react when you click them:
- the floating ghosts
- jack-o'-lanterns
- tombstones (a little ghost pops out)
- the witch and her bubbling cauldron
- dead trees (bats fly out)
- owls and dangling spiders
- the frog in the pond, black cats and the wolf on the tunnel hill
- glowing toadstools
- giant lollipops
- the Monster Mill's lightning machine
- the station houses
- the bats
- the moon (a wolf howls)

The other small buttons in the corner turn the sound on or off and switch to full screen.

## Tech

It's a static site with no build step:
- 3D graphics use [three.js](https://threejs.org/) r170, loaded from the jsDelivr CDN through an import map.
- Every model is built in code from simple shapes: no image or model files.
- Sounds are synthesised with the Web Audio API.
- The title font comes from Google Fonts.

| File | What it holds |
|---|---|
| `index.html` | Page, buttons and styles |
| `src/main.js` | Game logic, camera, clicks and effects |
| `src/world.js` | The board, track, stations and scenery |
| `src/track.js` | Layout maths (track shape, river, ground height) |
| `src/train.js` | The engine and wagons |
| `src/models.js` | Characters, mascots and props |
| `src/materials.js` | Shared materials and glows |
| `src/audio.js` | Sound effects |

It needs an internet connection the first time, to fetch three.js. To run it locally, serve the folder with any static web server, for example `python3 -m http.server`, because browsers won't load ES modules from `file://`.
