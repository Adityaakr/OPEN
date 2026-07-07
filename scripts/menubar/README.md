# Peal in your menu bar

A SwiftBar / xbar plugin that shows a live countdown for one seal in the
macOS menu bar: `🔒 2h 14m` while sealed, `🔓 revealed` when it opens.
Clicking it opens the seal link.

## install

```sh
brew install swiftbar        # or xbar
mkdir -p ~/.config/bte
echo 'https://bte-explorer-production.up.railway.app/#/s/<condition>/<cthash>' > ~/.config/bte/watch
cp scripts/menubar/bte.30s.sh "$HOME/Documents/SwiftBar/"   # your plugin folder
chmod +x "$HOME/Documents/SwiftBar/bte.30s.sh"
```

The `.30s` in the filename is the refresh interval. Point the watch file at
any seal link; the plugin polls the coordinator behind it (public read API,
no auth). Needs `python3` on PATH (ships with the Xcode command line tools).
