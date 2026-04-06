import argparse, math
from pathlib import Path
from typing import List, Tuple

import matplotlib

matplotlib.use("Agg")

import numpy as np
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection, Line3DCollection
from PIL import Image
import imageio.v2 as imageio

φ = (1 + 5**0.5) / 2

GEOM = {
    "tetra": (
        np.array([(1, 1, 1), (-1, -1, 1), (-1, 1, -1), (1, -1, -1)]) / math.sqrt(3),
        [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]],
    ),
    "cube": (
        np.array([(x, y, z) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]),
        [
            [0, 1, 3, 2],
            [4, 6, 7, 5],
            [0, 4, 5, 1],
            [2, 3, 7, 6],
            [0, 2, 6, 4],
            [1, 5, 7, 3],
        ],
    ),
    "octa": (
        np.array([(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]),
        [
            [0, 2, 4],
            [2, 1, 4],
            [1, 3, 4],
            [3, 0, 4],
            [0, 5, 2],
            [2, 5, 1],
            [1, 5, 3],
            [3, 5, 0],
        ],
    ),
    "dodeca": (
        np.array(
            [
                (+1, +1, +1),
                (+1, +1, -1),
                (+1, -1, +1),
                (+1, -1, -1),
                (-1, +1, +1),
                (-1, +1, -1),
                (-1, -1, +1),
                (-1, -1, -1),
                (0, 1 / φ, φ),
                (0, 1 / φ, -φ),
                (0, -1 / φ, φ),
                (0, -1 / φ, -φ),
                (1 / φ, φ, 0),
                (1 / φ, -φ, 0),
                (-1 / φ, φ, 0),
                (-1 / φ, -φ, 0),
                (φ, 0, 1 / φ),
                (φ, 0, -1 / φ),
                (-φ, 0, 1 / φ),
                (-φ, 0, -1 / φ),
            ]
        ),
        [
            [0, 8, 10, 2, 16],
            [0, 16, 17, 1, 12],
            [0, 12, 14, 4, 8],
            [8, 4, 18, 6, 10],
            [16, 2, 13, 3, 17],
            [12, 1, 9, 5, 14],
            [4, 14, 5, 19, 18],
            [2, 10, 6, 15, 13],
            [1, 17, 3, 11, 9],
            [5, 9, 11, 7, 19],
            [6, 18, 19, 7, 15],
            [3, 13, 15, 7, 11],
        ],
    ),
    "icosa": (
        np.array(
            [
                (-1, φ, 0),
                (1, φ, 0),
                (-1, -φ, 0),
                (1, -φ, 0),
                (0, -1, φ),
                (0, 1, φ),
                (0, -1, -φ),
                (0, 1, -φ),
                (φ, 0, -1),
                (φ, 0, 1),
                (-φ, 0, -1),
                (-φ, 0, 1),
            ]
        ),
        [
            [0, 11, 5],
            [0, 5, 1],
            [0, 1, 7],
            [0, 7, 10],
            [0, 10, 11],
            [1, 5, 9],
            [5, 11, 4],
            [11, 10, 2],
            [10, 7, 6],
            [7, 1, 8],
            [3, 9, 4],
            [3, 4, 2],
            [3, 2, 6],
            [3, 6, 8],
            [3, 8, 9],
            [4, 9, 5],
            [2, 4, 11],
            [6, 2, 10],
            [8, 6, 7],
            [9, 8, 1],
        ],
    ),
}


def build_edge_sets(faces: List[List[int]]) -> List[Tuple[int, int]]:
    edge_counter = {}
    for face in faces:
        n = len(face)
        for i in range(n):
            e = tuple(sorted((face[i], face[(i + 1) % n])))
            edge_counter[e] = edge_counter.get(e, 0) + 1
    return [e for e, c in edge_counter.items() if c == 2]


def normalise(v: np.ndarray) -> np.ndarray:
    return v / np.linalg.norm(v)


def rotate(pts: np.ndarray, axis: np.ndarray, θ: float) -> np.ndarray:
    axis = normalise(axis)
    c, s = np.cos(θ), np.sin(θ)
    return pts * c + np.cross(axis, pts) * s + np.outer(pts @ axis, axis) * (1 - c)


def lerp_axis(a: np.ndarray, b: np.ndarray, t: float) -> np.ndarray:
    return normalise(a * (1 - t) + b * t)


def face_brightness(cent: np.ndarray) -> np.ndarray:
    s = cent[:, 0] - cent[:, 1]
    return (s - s.min()) / (np.ptp(s) + 1e-9)


NAVY = np.array([0 / 255, 26 / 255, 77 / 255])
CYAN = np.array([30 / 255, 230 / 255, 255 / 255])


def blue_map(bright: np.ndarray) -> np.ndarray:
    return NAVY + bright[:, None] * (CYAN - NAVY)


def lanczos_rgba_downsample(img: Image.Image, target_px: int) -> Image.Image:
    arr = np.asarray(img).astype(np.float32) / 255
    rgb, a = arr[..., :3], arr[..., 3:4]
    premul = np.concatenate([rgb * a, a], -1)
    big = Image.fromarray((premul * 255).astype(np.uint8), "RGBA")
    small = big.resize((target_px, target_px), Image.Resampling.LANCZOS)
    arr2 = np.asarray(small).astype(np.float32) / 255
    a2 = arr2[..., 3:4]
    rgb2 = np.divide(
        arr2[..., :3], a2, out=np.zeros_like(arr2[..., :3]), where=a2 > 1e-3
    )
    out = np.clip(np.concatenate([rgb2, a2], -1) * 255, 0, 255).astype("uint8")
    return Image.fromarray(out, "RGBA")


def build_axes(
    mode: str, frames: int, fps: int, seed, shifts: int, chaos_std=0.1
) -> np.ndarray:
    if mode == "linear":
        axis = normalise(np.random.uniform(-1, 1, 3))
        out = np.tile(axis, (frames, 1))
    elif mode == "linearSeed":
        if seed is None:
            raise ValueError("--axis required with linearSeed")
        out = np.tile(normalise(seed), (frames, 1))
    elif mode == "random":
        seg = int(0.5 * fps)
        k = shifts + 1
        keys = [normalise(np.random.uniform(-1, 1, 3)) for _ in range(k)]
        out = np.empty((frames, 3))
        for i in range(k):
            s, e = i * seg, (i + 1) * seg if i < k - 1 else frames
            t = np.linspace(0, 1, e - s, endpoint=False)
            out[s:e] = [lerp_axis(keys[i], keys[(i + 1) % k], τ) for τ in t]
    elif mode == "chaos":
        axis = normalise(np.random.uniform(-1, 1, 3))
        out = np.empty((frames, 3))
        for i in range(frames):
            out[i] = axis
            axis = normalise(axis + np.random.normal(scale=chaos_std, size=3))
    else:
        raise ValueError("Unknown mode")
    out[-1] = out[0]
    return out


def render(
    solid: str,
    outfile: str,
    mode: str,
    seconds: float,
    fps: int,
    speed: float,
    axis_seed,
    shifts: int,
    transparent: bool,
    px: int,
    aa: int,
    webm: bool,
    wire_width: float,
):
    verts0, faces = GEOM[solid]
    verts = verts0.copy()
    internal_edges = build_edge_sets(faces)
    seg_idx = np.array([[a, b] for (a, b) in internal_edges])

    frames = max(2, int(seconds * fps))
    axes = build_axes(mode, frames, fps, axis_seed, shifts)
    R = np.linalg.norm(verts, axis=1).max() * 1.05
    dθ = 2 * math.pi * max(1, round(speed * seconds)) / (frames - 1)

    render_px = px * aa
    dpi = 100
    fig_sz = render_px / dpi
    path = Path(outfile).with_suffix(".webm" if webm else Path(outfile).suffix)
    mb = 16
    out_w = out_h = mb * math.ceil(px / mb) if webm else px

    if webm:
        pix = "yuva420p" if transparent else "yuv420p"
        writer = imageio.get_writer(
            path,
            mode="I",
            fps=fps,
            codec="libvpx-vp9",
            output_params=["-pix_fmt", pix, "-crf", "18"],
        )
    else:
        kw = {"fps": fps}
        kw["subrectangles"] = False if path.suffix.lower() in {".gif", ".png"} else None
        writer = imageio.get_writer(
            path, mode="I", **{k: v for k, v in kw.items() if v is not None}
        )

    for f in range(frames):
        fig = plt.figure(
            figsize=(fig_sz, fig_sz),
            dpi=dpi,
            facecolor=(0, 0, 0, 0 if transparent else 1),
        )
        ax = fig.add_subplot(111, projection="3d")
        ax.patch.set_alpha(0 if transparent else 1)
        ax.set_box_aspect([1, 1, 1])
        ax.view_init(elev=20, azim=30)

        cent = np.array([verts[idx].mean(0) for idx in faces])
        br = face_brightness(cent)

        for i, bright in enumerate(br):
            face_rgba = np.append(blue_map(np.array([bright]))[0], 0.55)
            ax.add_collection3d(
                Poly3DCollection(
                    [verts[faces[i]]],
                    facecolors=[face_rgba],
                    edgecolors="none",
                    antialiaseds=True,
                )
            )

        seg_coords = verts[seg_idx]
        wire_rgba = np.append(CYAN, 1.0)

        wire = Line3DCollection(
            seg_coords,
            colors=[wire_rgba],
            linewidths=wire_width,
            antialiaseds=True,
        )
        if hasattr(wire, "set_depthshade"):
            wire.set_depthshade(False)

        ax.add_collection3d(wire)

        ax.set_xlim(-R, R)
        ax.set_ylim(-R, R)
        ax.set_zlim(-R, R)
        ax.axis("off")
        fig.subplots_adjust(0, 0, 1, 1)

        fig.canvas.draw()
        rgba = np.frombuffer(fig.canvas.buffer_rgba(), np.uint8).reshape(
            fig.canvas.get_width_height()[::-1] + (4,)
        )
        img = Image.fromarray(rgba, "RGBA")
        if aa > 1:
            img = lanczos_rgba_downsample(img, px)

        if webm:
            if px != out_w:
                pad = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
                pad.paste(img, (0, 0))
                img = pad
            frame = np.asarray(img)
            writer.append_data(frame if transparent else frame[..., :3])
        else:
            arr = np.asarray(img)
            writer.append_data(arr if transparent else arr[..., :3])

        plt.close(fig)
        if f < frames - 1:
            verts = rotate(verts, axes[f], dθ)

    writer.close()
    print("Saved →", path.resolve())


def parse_axis(lst):
    if lst is None:
        return None
    if len(lst) != 3:
        raise argparse.ArgumentTypeError("--axis needs X Y Z")
    return np.array([float(v) for v in lst])


def main():
    solids = list(GEOM.keys())
    p = argparse.ArgumentParser(
        prog="platonic_spin",
        description="HD, seamlessly looping Platonic solids (WebM alpha ready)",
    )
    p.add_argument(
        "--solid",
        choices=solids,
        default="dodeca",
        help=f"Which solid to render (default dodeca)",
    )
    p.add_argument(
        "--mode", choices=["linear", "linearSeed", "random", "chaos"], default="linear"
    )
    p.add_argument("--axis", nargs=3, metavar=("X", "Y", "Z"))
    p.add_argument("--shifts", type=int, default=5)
    p.add_argument(
        "--rotations", type=float, help="Total full rotations (overrides --seconds)"
    )
    p.add_argument(
        "--seconds", type=float, default=60, help="Duration if --rotations not given"
    )
    p.add_argument("--fps", type=int, default=30)
    p.add_argument("--speed", type=float, default=1.0)
    p.add_argument("--px", type=int, default=1080)
    p.add_argument("--aa", type=int, default=2)
    p.add_argument("--outfile", default="solid.gif")
    p.add_argument(
        "--transparent", action="store_true", help="Keep alpha (GIF/APNG/WebM)"
    )
    p.add_argument(
        "--webm",
        action="store_true",
        help="Export VP9 WebM (alpha kept if --transparent)",
    )
    p.add_argument(
        "--wire-width",
        type=float,
        default=1.5,
        help="Interior wireframe linewidth (default 1.5 px)",
    )
    args = p.parse_args()

    seconds = args.rotations / args.speed if args.rotations else args.seconds
    seed = parse_axis(args.axis)

    render(
        solid=args.solid,
        outfile=args.outfile,
        mode=args.mode,
        seconds=seconds,
        fps=args.fps,
        speed=args.speed,
        axis_seed=seed,
        shifts=args.shifts,
        transparent=args.transparent,
        px=args.px,
        aa=args.aa,
        webm=args.webm,
        wire_width=args.wire_width,
    )


if __name__ == "__main__":
    main()
