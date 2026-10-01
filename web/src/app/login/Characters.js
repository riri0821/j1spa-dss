"use client";

import { useEffect, useRef, useState } from "react";

/* Ported from the reference Vue implementation (animated-characters-login-page),
   adapted to our coordinate system (viewBox 0-450 x, 0-340 y, ground at y=320)
   and our existing shapes/colors/sizing, which were separately tuned through
   direct feedback. What's ported here is the BEHAVIOR: continuous mouse-reactive
   body skew, random blinking, a brief "look at each other" moment when the
   email field gains focus, a periodic peek while the password is hidden-but-
   typed, and an animated success eye-look. */
// a tighter window into the same 0-450 x / 0-340 y coordinate space used by
// every shape/eye/mouth/skew calculation below - zooms in a bit (characters
// read bigger) and trims the bottom margin (characters sit higher in frame)
// without touching any of those absolute coordinates. Deliberately not done
// via a CSS transform: scale() on the <svg> - that produced an intermittent
// hairline rendering seam where it met the panel's overflow-hidden edge.
// Width is the binding constraint in the actual panel (taller than it is
// wide), so it's cropped tight around the character cluster (x:90-360) -
// that's what actually controls the rendered size, not the height values.
const VIEWBOX = "45 12 360 316";
const PUPIL_MAX_OFFSET = 4;
const MOUTH_MAX_OFFSET = 3;

// character anchor points (roughly top-third of each body) used for the
// mouse-delta skew and eye/mouth tracking math - mirrors the reference's
// `rect.top + rect.height / 3` convention
const CENTERS = {
  purple: { x: 215, y: 127 },
  blue: { x: 272, y: 187 },
  yellow: { x: 320, y: 227 },
  orange: { x: 180, y: 253 },
};

const EYES = {
  purple: [
    { id: "purple-l", cx: 195, cy: 60 },
    { id: "purple-r", cx: 235, cy: 60 },
  ],
  blue: [
    { id: "blue-l", cx: 256, cy: 145 },
    { id: "blue-r", cx: 284, cy: 145 },
  ],
  yellow: [{ id: "yellow-l", cx: 320, cy: 195 }],
  orange: [
    { id: "orange-l", cx: 160, cy: 270 },
    { id: "orange-r", cx: 200, cy: 270 },
  ],
};

const MOUTHS = {
  purple: { cx: 215, cy: 85 },
  yellow: { cx: 320, cy: 220 },
  orange: { cx: 180, cy: 276 },
  // blue has no mouth, matching the reference
};

// resting pupil position inside blue's squashed "sad" eye shape on a failed
// login (reference: EyeBall pins pupil Y near-center whenever isSad)
const BLUE_SAD_PUPIL_CY = 141;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export default function Characters({
  isTyping = false, // email field focused
  showPassword = false,
  passwordLength = 0,
  loginFailed = false,
  loginSuccess = false,
  mobile = false, // no cursor to track - eyes rest centered, glance up while typing
}) {
  const svgRef = useRef(null);
  const pupilRefs = useRef({});
  const mouthRefs = useRef({});
  const setPupilRef = (id, el) => {
    pupilRefs.current[id] = el;
  };
  const setMouthRef = (id, el) => {
    mouthRefs.current[id] = el;
  };

  const isHidingPassword = passwordLength > 0 && !showPassword;
  const isPeeking = passwordLength > 0 && showPassword;
  const isAttentive = (isTyping || isHidingPassword) && !loginFailed && !loginSuccess;

  const [skew, setSkew] = useState({ purple: 0, blue: 0, yellow: 0, orange: 0 });
  const [blink, setBlink] = useState({ purple: false, blue: false, orange: false, yellow: false });
  const [lookingAtEachOther, setLookingAtEachOther] = useState(false);
  const [purplePeeking, setPurplePeeking] = useState(false);

  // reference: purple gets translateX(40px) whenever it's in its amplified
  // typing/hiding-password lean; blue gets translateX(20px) only during the
  // brief look-at-each-other window (scaled down to our smaller viewBox units)
  const purpleShift = !isPeeking && (isTyping || isHidingPassword) ? 24 : 0;
  const blueShift = !isPeeking && lookingAtEachOther ? 11 : 0;

  // The face (eyes/mouth) lives in its own un-skewed group so pupils/mouths
  // never get sheared into ellipses - but it still needs to visually follow
  // wherever the body's current skew (and any translateX shift) moved that
  // Y-level to, via a plain translateX computed from the body's live state.
  function faceOffsetStyle(skewDeg, faceY, shiftX = 0) {
    const dx = (faceY - 320) * Math.tan((skewDeg * Math.PI) / 180);
    return { transform: `translateX(${dx + shiftX}px)`, transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)" };
  }

  // random blinking, independent per character
  useEffect(() => {
    const timeouts = [];
    function scheduleBlink(key) {
      const t = setTimeout(
        () => {
          setBlink((b) => ({ ...b, [key]: true }));
          const t2 = setTimeout(() => {
            setBlink((b) => ({ ...b, [key]: false }));
            scheduleBlink(key);
          }, 150);
          timeouts.push(t2);
        },
        Math.random() * 4000 + 3000
      );
      timeouts.push(t);
    }
    ["purple", "blue", "orange", "yellow"].forEach(scheduleBlink);
    return () => timeouts.forEach(clearTimeout);
  }, []);

  // brief "look at each other" moment when email gains focus
  useEffect(() => {
    // timed state driven by a prop change (focus event), not derivable without an effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLookingAtEachOther(isTyping);
    if (!isTyping) return;
    const t = setTimeout(() => setLookingAtEachOther(false), 800);
    return () => clearTimeout(t);
  }, [isTyping]);

  // while the password is shown, purple's eyes periodically widen a touch more -
  // a small secondary animation so the "peeking" pose isn't perfectly static
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPurplePeeking(false);
    if (!isPeeking) return;
    let t1;
    let t2;
    function schedule() {
      t1 = setTimeout(
        () => {
          setPurplePeeking(true);
          t2 = setTimeout(() => setPurplePeeking(false), 800);
        },
        Math.random() * 3000 + 2000
      );
    }
    schedule();
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isPeeking]);

  // upward eye animation on success
  useEffect(() => {
    if (!loginSuccess) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSkew({ purple: 0, blue: 0, yellow: 0, orange: 0 });

    let raf;
    const start = performance.now();
    const duration = 900;
    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = t < 0.5 ? 4 * t ** 3 : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const lookY = -3 + 6 * eased;
      for (const key of Object.keys(EYES)) {
        for (const eye of EYES[key]) {
          const pupil = pupilRefs.current[eye.id];
          if (pupil) {
            pupil.setAttribute("cx", String(eye.cx));
            pupil.setAttribute("cy", String(eye.cy + lookY));
          }
        }
      }
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);

    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [loginSuccess]);

  // continuous mouse-reactive skew + eye/mouth tracking
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    function toSvgPoint(clientX, clientY) {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return { x: 225, y: 180 };
      return pt.matrixTransform(ctm.inverse());
    }

    function applyEyeGroup(eyes, target) {
      for (const eye of eyes) {
        const pupil = pupilRefs.current[eye.id];
        if (!pupil) continue;
        const dx = target.x - eye.cx;
        const dy = target.y - eye.cy;
        const dist = Math.hypot(dx, dy) || 1;
        const offset = Math.min(PUPIL_MAX_OFFSET, dist / 10);
        pupil.setAttribute("cx", String(eye.cx + (dx / dist) * offset));
        pupil.setAttribute("cy", String(eye.cy + (dy / dist) * offset));
      }
    }

    // direct pixel offset, matching the reference's forceLookX/Y - a fixed
    // look direction, not a direction-toward-a-target like applyEyeGroup
    function applyForcedOffset(eyes, dx, dy) {
      for (const eye of eyes) {
        const pupil = pupilRefs.current[eye.id];
        if (!pupil) continue;
        pupil.setAttribute("cx", String(eye.cx + dx));
        pupil.setAttribute("cy", String(eye.cy + dy));
      }
    }

    function applyMouthForced(key, dx, dy) {
      const el = mouthRefs.current[key];
      if (!el) return;
      el.setAttribute("transform", `translate(${dx},${dy})`);
    }

    function applyMouth(key, target) {
      const m = MOUTHS[key];
      const el = mouthRefs.current[key];
      if (!m || !el) return;
      const dx = target.x - m.cx;
      const dy = target.y - m.cy;
      const dist = Math.hypot(dx, dy) || 1;
      const offset = Math.min(MOUTH_MAX_OFFSET, dist / 15);
      el.setAttribute("transform", `translate(${(dx / dist) * offset},${(dy / dist) * offset})`);
    }

    function computeSkew(center, targetX) {
      return clamp(-(targetX - center.x) / 40, -6, 6);
    }

    // reference: EyeBall pins pupil Y to a near-center resting value whenever
    // isSad, regardless of whatever X-tracking is active - only blue/black
    // gets the sad eye treatment on a failed login
    function pinBlueSadY() {
      if (!loginFailed) return;
      for (const eye of EYES.blue) {
        const pupil = pupilRefs.current[eye.id];
        if (pupil) pupil.setAttribute("cy", String(BLUE_SAD_PUPIL_CY));
      }
    }

    let frame = null;

    function update(target) {
      if (loginSuccess) return; // the success effect owns pupils/skew entirely

      if (isPeeking) {
        // reference's forceLookX/Y: a fixed per-character look direction, not
        // a direction-toward-a-target
        applyForcedOffset(EYES.purple, purplePeeking ? 4 : -4, purplePeeking ? 5 : -4);
        applyForcedOffset(EYES.blue, -4, -4);
        applyForcedOffset(EYES.yellow, -5, -4);
        applyForcedOffset(EYES.orange, -5, -4);
        applyMouthForced("purple", purplePeeking ? 3 : -3, purplePeeking ? 3.75 : -3);
        applyMouth("yellow", MOUTHS.yellow);
        applyMouth("orange", MOUTHS.orange);
        setSkew({ purple: 0, blue: 0, yellow: 0, orange: 0 });
        pinBlueSadY();
        return;
      }

      const base = {
        purple: computeSkew(CENTERS.purple, target.x),
        blue: computeSkew(CENTERS.blue, target.x),
        yellow: computeSkew(CENTERS.yellow, target.x),
        orange: computeSkew(CENTERS.orange, target.x),
      };

      if (lookingAtEachOther) {
        // reference amplifies blue's lean even further during this window
        setSkew({
          purple: base.purple - 12,
          blue: base.blue * 1.5 + 10,
          yellow: base.yellow,
          orange: base.orange,
        });
      } else if (isTyping || isHidingPassword) {
        setSkew({
          purple: base.purple - 12,
          blue: base.blue * 1.5,
          yellow: base.yellow,
          orange: base.orange,
        });
      } else {
        setSkew(base);
      }

      if (lookingAtEachOther) {
        applyForcedOffset(EYES.purple, 3, 4);
        applyForcedOffset(EYES.blue, 0, -4);
        applyMouthForced("purple", 2.25, 3);
        if (mobile) {
          applyForcedOffset(EYES.yellow, 0, 0);
          applyForcedOffset(EYES.orange, 0, 0);
          applyMouthForced("orange", 0, 0);
          applyMouthForced("yellow", 0, 0);
        } else {
          applyEyeGroup(EYES.yellow, target);
          applyEyeGroup(EYES.orange, target);
          applyMouth("orange", target);
          applyMouth("yellow", target);
        }
      } else if (mobile) {
        // no cursor on a touch device - rest centered when idle, glance up
        // toward the form fields (above the characters in the mobile layout)
        // while actively typing or hiding a typed password
        const lookUp = isTyping || isHidingPassword;
        for (const key of Object.keys(EYES)) applyForcedOffset(EYES[key], 0, lookUp ? -PUPIL_MAX_OFFSET : 0);
        for (const key of Object.keys(MOUTHS)) applyMouthForced(key, 0, lookUp ? -2 : 0);
      } else {
        for (const key of Object.keys(EYES)) applyEyeGroup(EYES[key], target);
        for (const key of Object.keys(MOUTHS)) applyMouth(key, target);
      }
      pinBlueSadY();
    }

    function onMouseMove(e) {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => update(toSvgPoint(e.clientX, e.clientY)));
    }

    update({ x: 225, y: 180 });
    if (!mobile) window.addEventListener("mousemove", onMouseMove);

    return () => {
      if (!mobile) window.removeEventListener("mousemove", onMouseMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [isTyping, isHidingPassword, isPeeking, purplePeeking, lookingAtEachOther, loginSuccess, loginFailed, mobile]);

  return (
    <div className="relative flex h-full w-full items-end justify-center">
      <style>{`
        @keyframes charDrop {
          0%   { transform: translateY(-300px); opacity: 0; }
          55%  { transform: translateY(16px);   opacity: 1; }
          75%  { transform: translateY(-8px); }
          100% { transform: translateY(0); }
        }
        .char-entrance {
          animation: charDrop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .char-body {
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
      `}</style>

      <svg
        ref={svgRef}
        viewBox={VIEWBOX}
        preserveAspectRatio="xMidYMax meet"
        className="h-full max-h-[820px] w-full max-w-[650px]"
      >
        <defs>
          {/* keeps any skewed character from ever poking out below the ground line */}
          <clipPath id="groundClip">
            <rect x={0} y={0} width={450} height={320} />
          </clipPath>
        </defs>
        <g>
          {/* PURPLE - back layer */}
          <g className="char-entrance" style={{ animationDelay: "0ms" }} clipPath="url(#groundClip)">
            <g
              className="char-body"
              style={{
                transform: `translateX(${purpleShift}px) skewX(${skew.purple}deg)`,
                transformOrigin: "215px 320px",
              }}
            >
              <rect x={160} y={30} width={110} height={290} fill="#199e70" />
            </g>
            <g style={faceOffsetStyle(skew.purple, 60, purpleShift)}>
              <Eye
                cx={195}
                cy={60}
                r={isPeeking ? (purplePeeking ? 9 : 8) : 6}
                id="purple-l"
                onRef={setPupilRef}
                pupilR={2.5}
                blinking={blink.purple}
              />
              <Eye
                cx={235}
                cy={60}
                r={isPeeking ? (purplePeeking ? 9 : 8) : 6}
                id="purple-r"
                onRef={setPupilRef}
                pupilR={2.5}
                blinking={blink.purple}
              />
              <g ref={(el) => setMouthRef("purple", el)}>
                <Mouth
                  state={loginFailed ? "error" : loginSuccess ? "smile" : isAttentive ? "shock-rect" : "neutral"}
                  x={215}
                  y={85}
                  width={28}
                  stroke="#0b0f19"
                />
              </g>
            </g>
          </g>

          {/* BLUE - middle, overlaps purple's right half. No mouth, matching the reference. */}
          <g className="char-entrance" style={{ animationDelay: "90ms" }}>
            <g
              className="char-body"
              style={{
                transform: `translateX(${blueShift}px) skewX(${skew.blue}deg)`,
                transformOrigin: "272px 320px",
              }}
            >
              <rect x={240} y={120} width={65} height={200} fill="#3987e5" />
            </g>
            <g style={faceOffsetStyle(skew.blue, 145, blueShift)}>
              <Eye
                cx={256}
                cy={145}
                r={7}
                id="blue-l"
                onRef={setPupilRef}
                pupilR={2}
                blinking={blink.blue}
                sad={loginFailed}
                sadRotate={-20}
              />
              <Eye
                cx={284}
                cy={145}
                r={7}
                id="blue-r"
                onRef={setPupilRef}
                pupilR={2}
                blinking={blink.blue}
                sad={loginFailed}
                sadRotate={20}
              />
            </g>
          </g>

          {/* YELLOW - arch/capsule, flat bottom */}
          <g className="char-entrance" style={{ animationDelay: "160ms" }}>
            <g className="char-body" style={{ transform: `skewX(${skew.yellow}deg)`, transformOrigin: "320px 320px" }}>
              <path d="M280,320 L280,220 A40,40 0 0 1 360,220 L360,320 Z" fill="#c98500" />
            </g>
            <g style={faceOffsetStyle(skew.yellow, 195)}>
              <Eye cx={320} cy={195} r={5} id="yellow-l" onRef={setPupilRef} pupilR={2} whiteBg={false} blinking={blink.yellow} />
              <g ref={(el) => setMouthRef("yellow", el)}>
                <Mouth
                  state={loginFailed ? "error-wavy" : loginSuccess ? "happy-curve" : "line"}
                  x={320}
                  y={220}
                  width={34}
                  stroke="#0b0f19"
                />
              </g>
            </g>
          </g>

          {/* ORANGE - foreground dome, overlaps purple + blue's bottoms */}
          <g className="char-entrance" style={{ animationDelay: "230ms" }}>
            <g className="char-body" style={{ transform: `skewX(${skew.orange}deg)`, transformOrigin: "180px 320px" }}>
              <path d="M90,320 A90,100 0 0 1 270,320 Z" fill="#ea580c" />
            </g>
            <g style={faceOffsetStyle(skew.orange, 270)}>
              <Eye cx={160} cy={270} r={6} id="orange-l" onRef={setPupilRef} pupilR={2.5} whiteBg={false} blinking={blink.orange} />
              <Eye cx={200} cy={270} r={6} id="orange-r" onRef={setPupilRef} pupilR={2.5} whiteBg={false} blinking={blink.orange} />
              <g ref={(el) => setMouthRef("orange", el)}>
                <Mouth
                  state={loginFailed ? "error" : isAttentive ? "shock-circle" : "smile-big"}
                  x={180}
                  y={276}
                  width={34}
                  stroke="#0b0f19"
                />
              </g>
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}

function Eye({ cx, cy, r, id, onRef, pupilR, whiteBg = true, blinking = false, sad = false, sadRotate = 0 }) {
  if (blinking) {
    return <rect x={cx - r} y={cy - 1} width={r * 2} height={2} rx={1} fill={whiteBg ? "#fff" : "#0b0f19"} />;
  }
  if (sad) {
    // reference: eyeball squashes to half-height, bottom corners round out into
    // a flat-topped dome, then rotates ±20deg - here, the flat edge sits at the
    // eye's normal top (cy-r) and the dome's rounded underside reaches down to cy
    const topY = cy - r;
    return (
      <g transform={`rotate(${sadRotate} ${cx} ${cy - r / 2})`}>
        <path d={`M${cx - r},${topY} A${r},${r} 0 0 0 ${cx + r},${topY} Z`} fill={whiteBg ? "#fff" : "#0b0f19"} />
        <circle ref={(el) => onRef(id, el)} cx={cx} cy={BLUE_SAD_PUPIL_CY} r={pupilR} fill="#0b0f19" />
      </g>
    );
  }
  if (!whiteBg) {
    // solid black dot, no white eye background - used for orange/yellow
    return <circle ref={(el) => onRef(id, el)} cx={cx} cy={cy} r={r * 0.4} fill="#0b0f19" style={{ transition: "r 0.2s ease" }} />;
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#fff" style={{ transition: "r 0.2s ease" }} />
      <circle ref={(el) => onRef(id, el)} cx={cx} cy={cy} r={pupilR} fill="#0b0f19" />
    </g>
  );
}

function Mouth({ state, x, y, width, stroke }) {
  const half = width / 2;
  if (state === "error") {
    // frown: middle HIGHER than the ends (ends droop down) - opens downward
    return <path d={`M${x - half},${y + 6} Q${x},${y - 8} ${x + half},${y + 6}`} stroke={stroke} strokeWidth={3} strokeLinecap="round" fill="none" />;
  }
  if (state === "error-wavy") {
    return (
      <path
        d={`M${x - half},${y} Q${x - half / 2},${y - 7} ${x},${y} T${x + half},${y}`}
        stroke={stroke}
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
      />
    );
  }
  if (state === "smile") {
    return <path d={`M${x - half},${y - 2} Q${x},${y + 10} ${x + half},${y - 2}`} stroke={stroke} strokeWidth={3} strokeLinecap="round" fill="none" />;
  }
  if (state === "happy-curve") {
    return <path d={`M${x - half},${y - 3} Q${x},${y + 9} ${x + half},${y - 3}`} stroke={stroke} strokeWidth={2.5} strokeLinecap="round" fill="none" />;
  }
  if (state === "smile-big") {
    // a circle cut in half horizontally - flat top edge, rounded bottom
    const r = half * 0.65;
    return <path d={`M${x - r},${y} A${r},${r} 0 0 0 ${x + r},${y} Z`} fill={stroke} />;
  }
  if (state === "shock-rect") {
    // thin vertical bar between the eyes - shocked/surprised look
    return <rect x={x - 2} y={y - 7} width={4} height={13} rx={1.5} fill={stroke} />;
  }
  if (state === "shock-circle") {
    // small filled dot, same visual weight as the eye pupils beside it
    return <circle cx={x} cy={y} r={4} fill={stroke} />;
  }
  if (state === "line") {
    return <line x1={x - half / 1.6} y1={y} x2={x + half / 1.6} y2={y} stroke={stroke} strokeWidth={3} strokeLinecap="round" />;
  }
  // neutral default
  return <line x1={x - half / 1.6} y1={y} x2={x + half / 1.6} y2={y} stroke={stroke} strokeWidth={3} strokeLinecap="round" />;
}
