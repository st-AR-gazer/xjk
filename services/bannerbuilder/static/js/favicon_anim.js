(() => {
  const VIDEO_SRC = "/spinning_dodecahedron/dodecahedron.webm";
  const FAV_ID = "dyn-fav";
  const SIZE = 32;
  const FPS = 12;
  const ZOOM = 2;

  const link = document.getElementById(FAV_ID);
  if (!link) return;

  const video = Object.assign(document.createElement("video"), {
    src: VIDEO_SRC, muted: true, loop: true, playsInline: true
  });

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");

  video.addEventListener("loadedmetadata", () => {
    const vw = video.videoWidth, vh = video.videoHeight;
    const cropW = vw / ZOOM, cropH = vh / ZOOM;
    const sx = (vw - cropW) / 2, sy = (vh - cropH) / 2;

    video.play().catch(() => { });

    let prev = 0;
    function step(ts) {
      if (ts - prev > 1000 / FPS) {
        const oldComp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = "copy";
        ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, SIZE, SIZE);
        ctx.globalCompositeOperation = oldComp;
        link.href = canvas.toDataURL("image/png");
        prev = ts;
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
})();
