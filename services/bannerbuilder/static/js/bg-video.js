document.addEventListener("DOMContentLoaded", () => {
  const clips = [
    "dodecahedron.webm",
    "tetrahedron.webm",
    "cube.webm",
    "octahedron.webm",
    "icosahedron.webm"
  ];
  const choice = clips[Math.floor(Math.random() * clips.length)];

  const vid = document.createElement("video");
  vid.id = "bg-poly-video";
  vid.src = `spinning/${choice}`;
  vid.autoplay = true;
  vid.loop = true;
  vid.muted = true;
  vid.playsInline = true;
  vid.playbackRate = 0.5;

  document.body.prepend(vid);

  const kick = () => { vid.play().catch(() => { }); window.removeEventListener("click", kick); };
  window.addEventListener("click", kick, { once: true });
});
