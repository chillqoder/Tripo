The three original invocations are synthesized locally with Piper's
[en_GB-alan-medium voice](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_GB/alan/medium),
then lowered in pitch, gently slowed, equalized, compressed, and given a short echo.
Only the resulting MP3 recordings are included; the app needs no speech service.

- Lightning: “Lightning, heed my call!”
- Fire: “Sacred fire, awaken!”
- Water: “Ancient waters, arise!”

The mouth animation follows the amplitude of these recordings. Elemental magic
sounds are generated separately by `src/audio.js` and dip under the voice.
