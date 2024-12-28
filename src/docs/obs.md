# OBS Scene/Source Setup
- All dolphins must be open before connecting to OBS.
You can open dolphins with the "Open Dolphins" button in Auto SLP Player
- OBS must be set to a canvas size of 1920x1080 to complete auto setup
- Auto setup and the default provided overlay assume a Melee aspect ratio of 73:60 (`Auto` or `Force 73:60 (Melee)` in Slippi Dolphin)
### Windows
Use `mode: "Capture specific window"`, `window match priority: "Window title must match"`, and `Capture Audio` for dolphin `Game Capture` sources and pre-assign dolphin windows.
If you're not using `Render to Main Window` in Dolphin `Graphics > General` be sure to set the window to the main window eg. `Faster Melee - Slippi (3.4.2) - 51441` and **not** `Faster Melee - Slippi (3.4.2) - 51441 | JIT64 SC | Direct3D 11 | HLE | FPS: 60 - VPS: 60 - 100%`.
### Mac
- Check `Graphics` > `General` > `Render to Main Window`
- Check `View` > `Show Toolbar`
- Check `View` > `Show Status Bar`
- Uncheck `View` > `Show Seekbar`
### Scene/Source auto switching and auto setup are unavailable on Linux
