# portal-credits

The Portal (2007) end credits, recreated in your terminal. Zero dependencies.

```
 |------------------------------------------|  |-------------------------------------------------|
 | Forms FORM-29827281-12:                  |  | >LIST PERSONNEL                                 |
 | Test Assessment Report                   |  |                                                 |
 | This was a triumph._                     |  | Gautam Babbar                                   |
 | I'm making a note here:                  |  | Ted Backman                                     |
 | HUGE SUCCESS.                            |  | Kelly Bailey                                    |
 | It's hard to overstate                   |  | Jeff Ballinger                                  |
 | my satisfaction.                         |  | ...                                             |
 |                                          |  |                                                 |
 |                .,-:;//;:=,               |  |                                                 |
 |            . :H@@@MM@M#H/.,+%;,          |  |                                                 |
 |         ,/X+ +M@@M@MM%=,-%HMMM@X/,       |  |                                                 |
```

GLaDOS' forms type themselves out on the left, character by character, as each
line is sung; the credit roll streams up on the right; and the game's ten ASCII
art panels print bottom-right beneath it — Aperture logo, atom, Black Mesa,
broken heart, fire, cake, GLaDOS — swapping on their real cues.

All of it runs off the sequence's own timing (120 cues): the letter pages
(`FORM-29827281-12`, `FORM-55551-5`, `-6`, the `PS:/PPS:/FINAL THOUGHT`
page), the ~140-name credit roll, the art changes, and the mid-line splits
(`I'm being ` / `so ` / `sincere right now.`).

The report header types itself out first, in silence. Playback starts at 7.3s,
the moment "This was a triumph" is typed, so the song and the first line begin
together and every later line stays on its beat. Just over three minutes,
matching the track.

The whole frame keeps the game's 4:3 proportions (an 8:3 character grid at
8×16 cells) and is centred with black margins on larger terminals, rather than
stretching to fill the window.

## Run it

Needs Node 18+ and a real terminal (not a pipe).

```bash
node bin/portal-credits.js
```

Keys: `space` pause, `←`/`→` seek 5s, `q` quit.

## The song

No audio ships here — "Still Alive" is Valve's and Jonathan Coulton's
recording, so it isn't in this repo. Bring your own copy; the tool finds it
automatically if it's named after the song:

```
still-alive.mp3          # also .flac .m4a .ogg .opus .wav .aac
portal_still_alive.mp3   # the game's own filename
```

Look in the repo folder, `./music/`, or `./audio/` — or point at it directly:

```bash
node bin/portal-credits.js --audio ~/Music/portal_still_alive.mp3
```

`$PORTAL_CREDITS_AUDIO` works too. Audio files and those folders are
gitignored, so your copy stays local.

**Where to get the track:**

- The free **Portal Soundtrack** DLC on Steam (`app/323170`) — installs loose
  tracks into `<steam library>/music/Portal Soundtrack/`.
- Or extract `sound/music/portal_still_alive.mp3` from
  `steamapps/common/Portal/portal/portal_pak_dir.vpk` with GCFScape, VPKEdit
  or `Source2Viewer-CLI`.

Playback goes through the first player it finds: `ffplay`, `mpv`, `vlc`,
`sox play`, `paplay`/`aplay`, macOS `afplay`, and in WSL or Windows the
built-in Windows media player (no install needed there). With no player, or
no track, the credits still play silently at the right pace.

The song starts with the first line, after the report header has typed itself
out. If your copy has an intro before "This was a triumph" (some rips and the
full soundtrack do), delay it with `--offset <sec>` — e.g. `--offset 7`.
`--speed <x>` runs the whole thing faster or slower (the audio is real-time, so
sound only lines up around 1x).

## Options

```
--audio <file>    your copy of the song
--offset <sec>    delay the song's start
--speed <x>       playback speed multiplier
--frame <sec>     print a single frame and exit (no TTY needed)
--width <cols>    frame width for --frame      (default 100)
--height <rows>   frame height for --frame     (default 40)
--no-color        plain text
```

Colour adapts: truecolor → 256-colour → plain, honours `NO_COLOR`, and stays
amber-on-black. The art needs roughly 76+ columns; narrower terminals give the
letter the full height instead.

## Credits

ASCII art and the credit roll are Valve's. "Still Alive" was written by
Jonathan Coulton and performed by Ellen McLain. Neither the song nor the
game's own assets are included in this repository beyond the short text and
art needed to recreate the credit screen; this is a fan tribute, not a
redistribution.
