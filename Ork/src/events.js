/**
 * Routes animation events to audio + effects.  Every sound / effect is triggered by a named animation event
 * (jaw opening, fist contact, fast part of the swing, blade contact...) - never "at the start of an action".
 */
export function wireEvents({ ctrl, audio, fx, ctx }) {
  ctrl.on((name, d) => {
    switch (name) {
      case 'breathIn': audio.play('breathIn', { gain: 0.8 }); break;
      case 'breathOut': audio.play('breathOut', { gain: 0.85 }); break;
      case 'growlLow': audio.play('growl', { gain: 0.75 }); break;
      case 'inhaleSharp': audio.play('breathIn', { gain: 1.1, rate: 1.18 }); break;
      case 'exhale': audio.play('breathOut', { gain: d.kind === 'big' ? 1.25 : 0.8, rate: 0.95 }); break;
      case 'grunt': audio.play('grunt', { gain: d.kind === 'brace' ? 0.75 : 1.0, rate: d.kind === 'prep' ? 0.92 : 1 }); break;
      case 'pump': audio.play('grunt', { gain: 0.8, rate: 1.1 + d.index * 0.04 }); break;
      case 'roar':
        audio.play(d.kind === 'long' ? 'roarLong' : d.kind === 'kiai' ? 'kiai' : 'roarShort', { gain: 1.0 });
        break;
      case 'whoosh':
        if (d.kind === 'swing') audio.play('whooshSwing', { gain: 1.15 });
        else if (d.kind === 'lift') audio.play('whooshLift', { gain: 0.7 });
        else audio.play('whooshLower', { gain: 0.55 });
        break;
      case 'chestHit':
        audio.play('thump', { gain: 0.9 + 0.2 * (d.strength || 1), jitter: 0.06 });
        fx.shake(0.012 * (d.strength || 1), 0.25);
        break;
      case 'impact':
        if (ctx.slam) fx.impact(ctx.slam.contact, ctx.slam.normal, 1);
        audio.play('impact', { gain: 1.25, jitter: 0.03 });
        break;
      case 'extract': audio.play('extract', { gain: 0.8 }); break;
      case 'actionStart': fx.clear?.(); break;
      default: break;
    }
  });
}
