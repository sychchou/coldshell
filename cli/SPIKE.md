# Spikes for the CLI

Not the CLI. The two things that decide whether there can be one, answered on a real machine.

## The chain, from a keypair file — works

A `solana-keygen`-shaped `id.json`, loaded in three lines, signs a `record_day` built from the
IDL. Both signatures verify and devnet's simulation returns `AccountNotInitialized (3012)` —
which is the right answer for a wallet with no run, and means the chain read the instruction and
accepted the signature.

The platform stays the fee payer, exactly as in the browser: the CLI asks the server for a
half-signed transaction and adds its own. Taking part should not require holding SOL whichever
client you use, and this way the CLI is another client of the same API rather than a second
implementation of it.

## Recording with the preview on — works

`record.mjs` is one ffmpeg with two outputs: the file that gets kept, and small raw frames that
get drawn. The preview *is* the recording rather than a second camera session that looks like it,
so what you watch is what went in. There is a clock, the minute counts down, enter keeps it and
ctrl-c throws it away — `q` to ffmpeg rather than a signal, because a half-written mp4 plays
nowhere.

```sh
node cli/record.mjs ~/minute.mp4
COLDSHELL_CAMERA=test COLDSHELL_SECONDS=8 node cli/record.mjs /tmp/t.mp4   # no camera needed
```

**The length comes from the file, not the stopwatch.** The stopwatch is for the screen, since a
file being written cannot be asked how long it is; afterwards ffprobe answers, and a clip short of
a minute is told so and kept anyway. This is the one thing the browser could never do —
MediaRecorder writes no duration at all, so the length had to be timed and then trusted.

## The camera, in a terminal — half answered

`ffmpeg` captures directly: `-f avfoundation` on macOS, `-f v4l2` on Linux, `-f dshow` on
Windows. Device enumeration works; opening the stream needs the camera permission, and **the
permission belongs to the terminal application**, not to us. A background shell cannot get it and
cannot even raise the prompt — which is why this is only half answered, and why the first run has
to happen in a terminal the person opened themselves.

`preview.mjs` draws the frames. Two pixels to a character — upper half block in the foreground
colour, lower half in the background — reading raw rgb24 on stdin, so ffmpeg captures and this
only draws. Checked against `testsrc2`.

```sh
ffmpeg -f avfoundation -pixel_format uyvy422 -framerate 15 -video_size 640x480 -i "0" \
  -f rawvideo -pix_fmt rgb24 -s 80x48 - 2>/dev/null | node cli/preview.mjs
```

`node cli/preview.mjs ascii` for terminals without truecolour.

It is deliberately small and rough. Nobody watches these recordings, including the person making
one, and a preview good enough to study your own face is a preview good enough to start editing
it. This answers "am I in frame, is the light on", and nothing past that.
