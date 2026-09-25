(() => {
  "use strict";

  const LAUNDRY_REVEAL_CONFIG = {
    revealRadius: 0.20,
    revealStrength: 1.0,

    // Water movement
    rippleCount: 7,
    rippleStrength: 0.75,
    rippleSpeed: 0.0035,
    waterStretch: 1.45,

    trailDecay: 0.992,
    mouseSmoothing: 0.14,
    velocityInfluence: 1.35,

    shimmerStrength: 0.10,
    completionThreshold: 0.85,

    maxDpr: 2
  };

  const scene = document.querySelector(".laundry-reveal__scene");
  const canvas = document.querySelector(".laundry-reveal__canvas");
  const dirtySource = document.querySelector(
    ".laundry-reveal__source--dirty"
  );
  const cleanSource = document.querySelector(
    ".laundry-reveal__source--clean"
  );
  const instruction = document.querySelector(
    ".laundry-reveal__instruction"
  );

  if (!scene || !canvas || !dirtySource || !cleanSource) return;

  const ctx = canvas.getContext("2d", { alpha: true });

  const maskCanvas = document.createElement("canvas");
  const maskCtx = maskCanvas.getContext("2d", { alpha: true });

  const cleanLayer = document.createElement("canvas");
  const cleanCtx = cleanLayer.getContext("2d", { alpha: true });

  const highlightLayer = document.createElement("canvas");
  const highlightCtx = highlightLayer.getContext("2d", { alpha: true });

  const coverageCanvas = document.createElement("canvas");
  coverageCanvas.width = 32;
  coverageCanvas.height = 32;

  const coverageCtx = coverageCanvas.getContext("2d", {
    willReadFrequently: true
  });

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  let coverageTick = 0;

  const state = {
    ready: false,
    inside: false,
    active: false,
    pointerId: null,

    started: false,
    completed: false,
    completion: 0,

    lastTime: performance.now(),
    raf: 0,

    target: {
      x: 0.5,
      y: 0.5
    },

    current: {
      x: 0.5,
      y: 0.5
    },

    previous: {
      x: 0.5,
      y: 0.5
    },

    velocity: {
      x: 0,
      y: 0
    },

    smoothVelocity: {
      x: 0,
      y: 0
    },

    lastBrush: null
  };

  /* =========================================================
     IMAGE LOADING
  ========================================================= */

  function loadImage(img) {
    return new Promise((resolve, reject) => {
      if (img.complete && img.naturalWidth > 0) {
        resolve(img);
        return;
      }

      const done = () => {
        cleanup();
        resolve(img);
      };

      const fail = () => {
        cleanup();
        reject(
          new Error(`Could not load ${img.src}`)
        );
      };

      const cleanup = () => {
        img.removeEventListener("load", done);
        img.removeEventListener("error", fail);
      };

      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", fail, { once: true });
    });
  }

  /* =========================================================
     CANVAS RESIZE
  ========================================================= */

  function resize() {
    const rect = canvas.getBoundingClientRect();

    const dpr = Math.min(
      window.devicePixelRatio || 1,
      LAUNDRY_REVEAL_CONFIG.maxDpr
    );

    const width = Math.max(
      1,
      Math.round(rect.width * dpr)
    );

    const height = Math.max(
      1,
      Math.round(rect.height * dpr)
    );

    if (
      canvas.width !== width ||
      canvas.height !== height
    ) {
      canvas.width = width;
      canvas.height = height;

      maskCanvas.width = width;
      maskCanvas.height = height;

      cleanLayer.width = width;
      cleanLayer.height = height;

      highlightLayer.width = width;
      highlightLayer.height = height;

      maskCtx.clearRect(
        0,
        0,
        width,
        height
      );
    }
  }

  /* =========================================================
     COVER IMAGE
     
     Keeps the 1920x1080 SVG proportional while filling
     the entire hero.
  ========================================================= */

  function drawImageCover(
    targetCtx,
    image,
    x,
    y,
    width,
    height
  ) {
    const imageWidth =
      image.naturalWidth || image.width;

    const imageHeight =
      image.naturalHeight || image.height;

    if (!imageWidth || !imageHeight) return;

    const scale = Math.max(
      width / imageWidth,
      height / imageHeight
    );

    const drawWidth =
      imageWidth * scale;

    const drawHeight =
      imageHeight * scale;

    const drawX =
      x + (width - drawWidth) / 2;

    const drawY =
      y + (height - drawHeight) / 2;

    targetCtx.drawImage(
      image,
      drawX,
      drawY,
      drawWidth,
      drawHeight
    );
  }

  /* =========================================================
     MASK
  ========================================================= */

  function clearMask() {
    maskCtx.clearRect(
      0,
      0,
      maskCanvas.width,
      maskCanvas.height
    );
  }

  /* =========================================================
     WATER BRUSH
     
     Instead of a simple circle, this creates several
     overlapping moving elliptical water ripples.
  ========================================================= */

  function stamp(x, y, vx, vy) {
  if (!state.started) return;

  const px = x * canvas.width;
  const py = (1 - y) * canvas.height;

  const minSize = Math.min(
    canvas.width,
    canvas.height
  );

  const radius =
    minSize *
    LAUNDRY_REVEAL_CONFIG.revealRadius;

  const speed = Math.min(
    1,
    Math.hypot(vx, vy) *
      LAUNDRY_REVEAL_CONFIG.velocityInfluence
  );

  const direction =
    Math.atan2(-vy, vx);

  const time =
    performance.now() * 0.0025;

  maskCtx.save();

  maskCtx.translate(px, py);
  maskCtx.rotate(direction);

  /* -----------------------------------------
     MAIN WATER FLOW
  ----------------------------------------- */

  const flowGradient =
    maskCtx.createRadialGradient(
      0,
      0,
      0,
      0,
      0,
      radius
    );

  flowGradient.addColorStop(
    0,
    "rgba(255,255,255,0.95)"
  );

  flowGradient.addColorStop(
    0.35,
    "rgba(255,255,255,0.72)"
  );

  flowGradient.addColorStop(
    0.62,
    "rgba(255,255,255,0.38)"
  );

  flowGradient.addColorStop(
    0.82,
    "rgba(255,255,255,0.12)"
  );

  flowGradient.addColorStop(
    1,
    "rgba(255,255,255,0)"
  );

  maskCtx.fillStyle =
    flowGradient;

  maskCtx.beginPath();

  maskCtx.ellipse(
    0,
    0,
    radius *
      (1.0 + speed * 1.2),

    radius *
      (0.55 + speed * 0.2),

    0,
    0,
    Math.PI * 2
  );

  maskCtx.fill();


  /* -----------------------------------------
     MOVING WATER WAVES
  ----------------------------------------- */

  for (let i = 0; i < 4; i++) {

    const waveTime =
      time +
      i * 1.6;

    const distance =
      radius *
      (0.45 + i * 0.28);

    const waveX =
      Math.cos(waveTime) *
      distance;

    const waveY =
      Math.sin(waveTime * 1.25) *
      distance *
      0.35;

    const waveSize =
      radius *
      (0.28 + i * 0.08);

    const waveGradient =
      maskCtx.createRadialGradient(
        waveX,
        waveY,
        waveSize * 0.35,

        waveX,
        waveY,
        waveSize
      );

    waveGradient.addColorStop(
      0,
      "rgba(255,255,255,0)"
    );

    waveGradient.addColorStop(
      0.55,
      `rgba(255,255,255,${
        0.32 - i * 0.045
      })`
    );

    waveGradient.addColorStop(
      0.78,
      `rgba(255,255,255,${
        0.15 - i * 0.025
      })`
    );

    waveGradient.addColorStop(
      1,
      "rgba(255,255,255,0)"
    );

    maskCtx.fillStyle =
      waveGradient;

    maskCtx.beginPath();

    maskCtx.ellipse(
      waveX,
      waveY,
      waveSize *
        (1.8 + speed * 0.8),

      waveSize *
        0.42,

      Math.sin(waveTime) * 0.2,

      0,
      Math.PI * 2
    );

    maskCtx.fill();
  }


  /* -----------------------------------------
     SMALL WATER DROPLET TRAILS
  ----------------------------------------- */

  for (let i = 0; i < 3; i++) {

    const trail =
      radius *
      (0.5 + i * 0.28);

    const dropX =
      -trail;

    const dropY =
      Math.sin(
        time * 2 + i
      ) *
      radius *
      0.18;

    const dropRadius =
      radius *
      (0.10 - i * 0.015);

    const dropGradient =
      maskCtx.createRadialGradient(
        dropX,
        dropY,
        0,
        dropX,
        dropY,
        dropRadius
      );

    dropGradient.addColorStop(
      0,
      "rgba(255,255,255,0.55)"
    );

    dropGradient.addColorStop(
      0.6,
      "rgba(255,255,255,0.20)"
    );

    dropGradient.addColorStop(
      1,
      "rgba(255,255,255,0)"
    );

    maskCtx.fillStyle =
      dropGradient;

    maskCtx.beginPath();

    maskCtx.arc(
      dropX,
      dropY,
      dropRadius,
      0,
      Math.PI * 2
    );

    maskCtx.fill();
  }

  maskCtx.restore();
}

  /* =========================================================
     CONNECT WATER STROKES
  ========================================================= */

  function drawStrokeBetween(a, b) {
    if (!a || !b) return;

    const dx = b.x - a.x;
    const dy = b.y - a.y;

    const distance =
      Math.hypot(dx, dy);

    const brushSize =
      Math.min(
        canvas.width,
        canvas.height
      );

    const steps = Math.max(
      1,
      Math.ceil(
        distance /
        (brushSize * 0.025)
      )
    );

    for (
      let i = 1;
      i <= steps;
      i++
    ) {
      const t = i / steps;

      const x =
        a.x + dx * t;

      const y =
        a.y + dy * t;

      stamp(
        x,
        y,
        dx / Math.max(
          distance,
          0.001
        ),
        dy / Math.max(
          distance,
          0.001
        )
      );
    }
  }

  /* =========================================================
     WATER FADE
     
     Keeps the reveal gently alive instead of leaving
     completely static brush marks.
  ========================================================= */

  function fadeMask(dt) {
    const fade =
      Math.max(
        0.002,
        1 -
          Math.pow(
            LAUNDRY_REVEAL_CONFIG.trailDecay,
            dt * 60
          )
      );

    /*
      Don't erase the entire reveal once completed.
    */
    if (state.completed) return;

    maskCtx.save();

    maskCtx.globalCompositeOperation =
      "destination-out";

    maskCtx.fillStyle =
      `rgba(0,0,0,${fade * 0.35})`;

    maskCtx.fillRect(
      0,
      0,
      maskCanvas.width,
      maskCanvas.height
    );

    maskCtx.restore();
  }

  /* =========================================================
     COVERAGE
     
     Measures the entire hero instead of the old
     square garment area.
  ========================================================= */

  function maskCoverage() {
    coverageCtx.clearRect(
      0,
      0,
      32,
      32
    );

    coverageCtx.drawImage(
      maskCanvas,
      0,
      0,
      32,
      32
    );

    const pixels =
      coverageCtx.getImageData(
        0,
        0,
        32,
        32
      ).data;

    let total = 0;

    for (
      let i = 3;
      i < pixels.length;
      i += 4
    ) {
      total += pixels[i] / 255;
    }

    return (
      total /
      (32 * 32)
    );
  }

  /* =========================================================
     RENDER
  ========================================================= */

  function render(
    now = performance.now()
  ) {
    if (!state.ready) return;

    const dt =
      Math.min(
        0.05,
        (now - state.lastTime) / 1000
      );

    state.lastTime = now;

    resize();

    /* -----------------------------------------
       Smooth pointer
    ----------------------------------------- */

    state.current.x +=
      (
        state.target.x -
        state.current.x
      ) *
      LAUNDRY_REVEAL_CONFIG.mouseSmoothing;

    state.current.y +=
      (
        state.target.y -
        state.current.y
      ) *
      LAUNDRY_REVEAL_CONFIG.mouseSmoothing;

    /* -----------------------------------------
       Velocity
    ----------------------------------------- */

    state.velocity.x =
      (
        state.current.x -
        state.previous.x
      ) /
      Math.max(dt, 0.001);

    state.velocity.y =
      (
        state.current.y -
        state.previous.y
      ) /
      Math.max(dt, 0.001);

    state.smoothVelocity.x +=
      (
        state.velocity.x -
        state.smoothVelocity.x
      ) *
      0.10;

    state.smoothVelocity.y +=
      (
        state.velocity.y -
        state.smoothVelocity.y
      ) *
      0.10;

    state.previous.x =
      state.current.x;

    state.previous.y =
      state.current.y;

    /* -----------------------------------------
       Water movement
    ----------------------------------------- */

    if (
      state.started &&
      (state.inside || state.active)
    ) {
      const point = {
        x: state.current.x,
        y: state.current.y
      };

      drawStrokeBetween(
        state.lastBrush,
        point
      );

      state.lastBrush = point;
    } else {
      state.lastBrush = null;
    }

    fadeMask(dt);

    /* -----------------------------------------
       Coverage
    ----------------------------------------- */

    if (
      ++coverageTick % 6 === 0 ||
      state.completion < 0.01
    ) {
      state.completion =
        maskCoverage();
    }

    /* -----------------------------------------
       Completion
    ----------------------------------------- */

    if (
      !state.completed &&
      state.completion >=
        LAUNDRY_REVEAL_CONFIG
          .completionThreshold
    ) {
      state.completed = true;

      scene.classList.add(
        "laundry-reveal--complete"
      );

      if (instruction) {
        instruction.textContent = "";
      }
    }

    const w = canvas.width;
    const h = canvas.height;

    /* -----------------------------------------
       Clear
    ----------------------------------------- */

    ctx.clearRect(
      0,
      0,
      w,
      h
    );

    /* -----------------------------------------
       DIRTY IMAGE
    ----------------------------------------- */

    drawImageCover(
      ctx,
      dirtySource,
      0,
      0,
      w,
      h
    );

    /* -----------------------------------------
       CLEAN IMAGE
    ----------------------------------------- */

    cleanCtx.clearRect(
      0,
      0,
      w,
      h
    );

    cleanCtx.globalCompositeOperation =
      "source-over";

    drawImageCover(
      cleanCtx,
      cleanSource,
      0,
      0,
      w,
      h
    );

    /*
      Apply water mask.
    */
    cleanCtx.globalCompositeOperation =
      "destination-in";

    cleanCtx.drawImage(
      maskCanvas,
      0,
      0
    );

    cleanCtx.globalCompositeOperation =
      "source-over";

    ctx.drawImage(
      cleanLayer,
      0,
      0
    );

    /* -----------------------------------------
       WATER SHIMMER
    ----------------------------------------- */

    if (
      !reducedMotion &&
      state.started &&
      state.completion > 0.02
    ) {
      highlightCtx.clearRect(
        0,
        0,
        w,
        h
      );

      const sweepX =
        (
          now * 0.035
        ) %
        (w * 1.5)
        -
        w * 0.25;

      const glow =
        highlightCtx.createLinearGradient(
          sweepX - w * 0.08,
          0,
          sweepX + w * 0.08,
          0
        );

      glow.addColorStop(
        0,
        "rgba(255,255,255,0)"
      );

      glow.addColorStop(
        0.5,
        `rgba(
          255,
          255,
          255,
          ${LAUNDRY_REVEAL_CONFIG.shimmerStrength}
        )`
      );

      glow.addColorStop(
        1,
        "rgba(255,255,255,0)"
      );

      highlightCtx.fillStyle =
        glow;

      highlightCtx.globalAlpha =
        Math.min(
          0.55,
          state.completion * 1.4
        );

      highlightCtx.fillRect(
        0,
        0,
        w,
        h
      );

      /*
        Only show shimmer where
        water has already cleaned.
      */
      highlightCtx.globalCompositeOperation =
        "destination-in";

      highlightCtx.globalAlpha = 1;

      highlightCtx.drawImage(
        maskCanvas,
        0,
        0
      );

      highlightCtx.globalCompositeOperation =
        "source-over";

      ctx.globalCompositeOperation =
        "screen";

      ctx.drawImage(
        highlightLayer,
        0,
        0
      );

      ctx.globalCompositeOperation =
        "source-over";
    }

    state.raf =
      requestAnimationFrame(render);
  }

  /* =========================================================
     POINTER
  ========================================================= */

  function pointerPosition(event) {
    const rect =
      canvas.getBoundingClientRect();

    const x =
      (event.clientX - rect.left) /
      rect.width;

    const y =
      1 -
      (
        (event.clientY - rect.top) /
        rect.height
      );

    return {
      x,
      y
    };
  }

  function inCanvas(point) {
    return (
      point.x >= 0 &&
      point.x <= 1 &&
      point.y >= 0 &&
      point.y <= 1
    );
  }

  function startInteraction() {
    if (!state.started) {
      state.started = true;

      scene.classList.add(
        "laundry-reveal--active"
      );

      if (instruction) {
        instruction.textContent =
          "WASHING…";
      }
    }
  }

  function onPointerMove(event) {
    const point =
      pointerPosition(event);

    if (!inCanvas(point)) return;

    state.target.x =
      point.x;

    state.target.y =
      point.y;

    state.inside = true;

    startInteraction();

    /*
      Touch devices behave like
      a continuous water stroke.
    */
    if (
      event.pointerType === "touch"
    ) {
      state.active = true;
    }
  }

  function onPointerDown(event) {
    const point =
      pointerPosition(event);

    if (!inCanvas(point)) return;

    state.pointerId =
      event.pointerId;

    state.active = true;
    state.inside = true;

    state.target.x =
      point.x;

    state.target.y =
      point.y;

    startInteraction();

    canvas.setPointerCapture?.(
      event.pointerId
    );
  }

  function onPointerUp(event) {
    state.active = false;
    state.pointerId = null;

    canvas.releasePointerCapture?.(
      event.pointerId
    );
  }

  function onPointerLeave() {
    state.inside = false;

    if (!state.active) {
      state.lastBrush = null;

      scene.classList.remove(
        "laundry-reveal--active"
      );

      if (
        instruction &&
        !state.completed
      ) {
        instruction.textContent =
          "MOVE TO CLEAN";
      }
    }
  }

  /* =========================================================
     INITIALIZATION
  ========================================================= */

  async function init() {
    try {
      await Promise.all([
        loadImage(dirtySource),
        loadImage(cleanSource)
      ]);

      state.ready = true;

      resize();
      clearMask();

      render();

    } catch (error) {
      console.error(
        "Laundry reveal image loading failed:",
        error
      );

      scene.classList.add(
        "is-fallback"
      );

      canvas.classList.add(
        "is-fallback"
      );

      dirtySource.style.opacity = "1";
    }
  }

  /* =========================================================
     CLEANUP
  ========================================================= */

  function destroy() {
    cancelAnimationFrame(
      state.raf
    );

    canvas.removeEventListener(
      "pointermove",
      onPointerMove
    );

    canvas.removeEventListener(
      "pointerdown",
      onPointerDown
    );

    canvas.removeEventListener(
      "pointerup",
      onPointerUp
    );

    canvas.removeEventListener(
      "pointerleave",
      onPointerLeave
    );

    window.removeEventListener(
      "resize",
      resize
    );
  }

  /* =========================================================
     EVENTS
  ========================================================= */

  canvas.addEventListener(
    "pointermove",
    onPointerMove,
    { passive: true }
  );

  canvas.addEventListener(
    "pointerdown",
    onPointerDown,
    { passive: true }
  );

  canvas.addEventListener(
    "pointerup",
    onPointerUp,
    { passive: true }
  );

  canvas.addEventListener(
    "pointerleave",
    onPointerLeave,
    { passive: true }
  );

  window.addEventListener(
    "resize",
    resize,
    { passive: true }
  );

  window.destroyLaundryReveal =
    destroy;

  init();
})();

/* =========================================================
   MERYLAND CONTACT + BOOKING WHATSAPP
========================================================= */

(() => {
  "use strict";

  const whatsappNumber = "573043708470";

  function openWhatsApp(message) {

    const encodedMessage =
      encodeURIComponent(message);

    const url =
      `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;

    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );
  }


  /* =======================================================
     CONTACT FORM
  ======================================================= */

  const contactForm =
    document.getElementById("contactForm");

  if (contactForm) {

    contactForm.addEventListener(
      "submit",
      function(event) {

        event.preventDefault();

        const name =
          document.getElementById("contactName").value.trim();

        const email =
          document.getElementById("contactEmail").value.trim();

        const phone =
          document.getElementById("contactPhone").value.trim();

        const subject =
          document.getElementById("contactSubject").value;

        const message =
          document.getElementById("contactMessage").value.trim();


        const whatsappMessage =
`Hello Meryland Care! 👋

I have a question/request.

*Name:* ${name}
*Email:* ${email}
*Phone:* ${phone || "Not provided"}
*Topic:* ${subject}

*Message:*
${message}`;


        openWhatsApp(
          whatsappMessage
        );

      }
    );

  }


  /* =======================================================
     BOOKING FORM
  ======================================================= */

  const bookingForm =
    document.getElementById("bookingForm");

  if (bookingForm) {

    bookingForm.addEventListener(
      "submit",
      function(event) {

        event.preventDefault();


        const name =
          document.getElementById("bookingName").value.trim();

        const email =
          document.getElementById("bookingEmail").value.trim();

        const phone =
          document.getElementById("bookingPhone").value.trim();


        const selectedService =
          document.querySelector(
            'input[name="service"]:checked'
          );

        const service =
          selectedService
            ? selectedService.value
            : "Not specified";


        const method =
          document.getElementById("bookingMethod").value;

        const date =
          document.getElementById("bookingDate").value;

        const time =
          document.getElementById("bookingTime").value;

        const details =
          document.getElementById("bookingDetails").value.trim();

        const notes =
          document.getElementById("bookingNotes").value.trim();


        const formattedDate =
          date
            ? new Date(
                `${date}T12:00:00`
              ).toLocaleDateString(
                "en-CA",
                {
                  year: "numeric",
                  month: "long",
                  day: "numeric"
                }
              )
            : "Not specified";


        const whatsappMessage =
`Hello Meryland Care! 👋

I'd like to request a service.

*CUSTOMER*
Name: ${name}
Email: ${email}
Phone: ${phone}

*SERVICE*
Service: ${service}
Method: ${method || "Not specified"}

Preferred date: ${formattedDate}
Preferred time: ${time || "Not specified"}

*GARMENT DETAILS*
${details || "Not provided"}

*ADDITIONAL NOTES*
${notes || "None"}

Thank you!`;


        openWhatsApp(
          whatsappMessage
        );

      }
    );

  }

})();

/* =========================================================
   FOOTER WATER
   Interactive water surface
========================================================= */

(() => {
  const canvas = document.getElementById("footerWater");

  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  let width = 0;
  let height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  const waves = [];
  const ripples = [];

  const pointer = {
    x: 0.5,
    y: 0.5,
    targetX: 0.5,
    targetY: 0.5,
    active: false
  };

  /* ---------------------------------------------------------
     RESIZE
  --------------------------------------------------------- */

  function resizeFooterWater() {
    const rect = canvas.getBoundingClientRect();

    width = rect.width;
    height = rect.height;

    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );

    createWaves();
  }

  /* ---------------------------------------------------------
     BASE WAVES
  --------------------------------------------------------- */

  function createWaves() {
    waves.length = 0;

    for (let i = 0; i < 4; i++) {
      waves.push({
        amplitude: 5 + i * 2,
        wavelength: 170 + i * 55,
        speed: .0007 + i * .00025,
        phase: Math.random() * Math.PI * 2,
        opacity: .18 - i * .025
      });
    }
  }

  /* ---------------------------------------------------------
     POINTER
  --------------------------------------------------------- */

  const footer = canvas.closest(".site-footer");

  footer.addEventListener(
    "pointermove",
    event => {

      const rect = footer.getBoundingClientRect();

      const x =
        (event.clientX - rect.left) /
        rect.width;

      const y =
        (event.clientY - rect.top) /
        rect.height;

      pointer.targetX = x;
      pointer.targetY = y;
      pointer.active = true;

      /*
        Only create ripples when the pointer
        is close to the water surface.
      */

      if (y < .15) {

        ripples.push({
          x: x * width,
          strength: 1,
          radius: 5,
          speed: 1.2
        });

        if (ripples.length > 18) {
          ripples.shift();
        }
      }
    },
    { passive: true }
  );

  footer.addEventListener(
    "pointerleave",
    () => {
      pointer.active = false;
    }
  );

  /* ---------------------------------------------------------
     DRAW
  --------------------------------------------------------- */

  function draw(time) {

    pointer.x +=
      (pointer.targetX - pointer.x) * .08;

    pointer.y +=
      (pointer.targetY - pointer.y) * .08;

    ctx.clearRect(
      0,
      0,
      width,
      height
    );

    /*
      Base water surface
    */

    const gradient =
      ctx.createLinearGradient(
        0,
        0,
        0,
        height
      );

    gradient.addColorStop(
      0,
      "rgba(140,236,249,.55)"
    );

    gradient.addColorStop(
      .35,
      "rgba(84,116,148,.18)"
    );

    gradient.addColorStop(
      1,
      "rgba(17,46,98,0)"
    );

    ctx.fillStyle = gradient;

    ctx.beginPath();

    ctx.moveTo(0, height);

    for (let x = 0; x <= width; x += 4) {

      let y = 38;

      /*
        Natural wave motion
      */

      for (const wave of waves) {

        y +=
          Math.sin(
            x / wave.wavelength +
            time * wave.speed +
            wave.phase
          ) *
          wave.amplitude;
      }

      /*
        Pointer creates local displacement
      */

      if (pointer.active) {

        const pointerX =
          pointer.x * width;

        const distance =
          Math.abs(x - pointerX);

        const influence =
          Math.max(
            0,
            1 - distance / 260
          );

        const movement =
          (
            pointer.targetY -
            pointer.y
          ) * 80;

        y +=
          influence *
          movement;
      }

      /*
        Mouse-created ripples
      */

      for (const ripple of ripples) {

        const distance =
          Math.abs(x - ripple.x);

        const waveDistance =
          Math.abs(
            distance -
            ripple.radius
          );

        const influence =
          Math.max(
            0,
            1 -
            waveDistance / 70
          );

        y -=
          Math.sin(
            waveDistance * .12
          ) *
          influence *
          ripple.strength *
          8;
      }

      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();

    ctx.fill();

    /*
      Highlight line along the water surface
    */

    ctx.beginPath();

    for (let x = 0; x <= width; x += 4) {

      let y = 38;

      for (const wave of waves) {

        y +=
          Math.sin(
            x / wave.wavelength +
            time * wave.speed +
            wave.phase
          ) *
          wave.amplitude;
      }

      if (pointer.active) {

        const pointerX =
          pointer.x * width;

        const distance =
          Math.abs(x - pointerX);

        const influence =
          Math.max(
            0,
            1 - distance / 250
          );

        y +=
          influence *
          (
            pointer.targetY -
            pointer.y
          ) *
          80;
      }

      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.strokeStyle =
      "rgba(255,255,255,.42)";

    ctx.lineWidth = 1.5;

    ctx.stroke();

    /*
      Update ripples
    */

    for (let i = ripples.length - 1; i >= 0; i--) {

      const ripple = ripples[i];

      ripple.radius += ripple.speed;
      ripple.strength *= .965;

      if (ripple.strength < .03) {
        ripples.splice(i, 1);
      }
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener(
    "resize",
    resizeFooterWater,
    { passive: true }
  );

  resizeFooterWater();

  requestAnimationFrame(draw);

})();