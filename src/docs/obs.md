# OBS Scene/Source Setup
### Scene/Source autoswitching is unavailable on Linux
All dolphins must be open before connecting to OBS.
You can open dolphins with the "Open Dolphins" button in Auto SLP Player.
Use `mode: "Capture specific window"`, `window match priority: "Window title must match"`, and `Capture Audio` for dolphin `Game Capture` sources and pre-assign dolphin windows.
If you're not using `Render to Main Window` in Dolphin `Graphics > General` be sure to set the window to the main window eg. `Faster Melee - Slippi (3.4.2) - 51441` and **not** `Faster Melee - Slippi (3.4.2) - 51441 | JIT64 SC | Direct3D 11 | HLE | FPS: 60 - VPS: 60 - 100%`.

Your OBS scene collection must have **at least** these scenes and each scene should have **at least** the listed inputs:
* Scene: "quad 0"
* Scene: "quad 1"
  * Game input: 1st Dolphin (default: 51441)
  * Game input: 2nd Dolphin (default: 51442)
  * Game input: 3rd Dolphin (default: 51443)
  * Game input: 4th Dolphin (default: 51444)
* Scene: "quad 2 12"
  * Game input: 1st Dolphin (default: 51441)
  * Game input: 2nd Dolphin (default: 51442)
* Scene: "quad 2 13"
  * Game input: 1st Dolphin (default: 51441)
  * Game input: 3rd Dolphin (default: 51443)
* Scene: "quad 2 14"
  * Game input: 1st Dolphin (default: 51441)
  * Game input: 4th Dolphin (default: 51444)
* Scene: "quad 2 23"
  * Game input: 2nd Dolphin (default: 51442)
  * Game input: 3rd Dolphin (default: 51443)
* Scene: "quad 2 24"
  * Game input: 2nd Dolphin (default: 51442)
  * Game input: 4th Dolphin (default: 51444)
* Scene: "quad 2 34"
  * Game input: 3nd Dolphin (default: 51443)
  * Game input: 4th Dolphin (default: 51444)
* Scene: "quad 3"
  * Game input: 1st Dolphin (default: 51441)
  * Game input: 2nd Dolphin (default: 51442)
  * Game input: 3rd Dolphin (default: 51443)
  * Game input: 4th Dolphin (default: 51444)
* Scene: "quad 4"
  * Game input: 1st Dolphin (default: 51441)
  * Game input: 2nd Dolphin (default: 51442)
  * Game input: 3rd Dolphin (default: 51443)
  * Game input: 4th Dolphin (default: 51444)
