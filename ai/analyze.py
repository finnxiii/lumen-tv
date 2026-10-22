"""Offline scene analysis for the demo clips.

Samples each clip's original.mp4 once per second and writes ai/scenes/<clipId>.json:
a list of SceneInsights (shared/contract.md) that the backend serves by playback position.

Usage:
    python3 ai/analyze.py ~/lumen-media            # every <clip>/original.mp4 under it
    python3 ai/analyze.py --self-test              # synthetic check, no clips needed
"""

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

SAMPLE_EVERY_S = 1.0
# Histogram correlation below this between consecutive samples = a cut.
SCENE_CHANGE_CORREL = 0.6


def measure(frame: np.ndarray) -> dict:
    """Brightness, contrast, saturation of one BGR frame, each 0..1."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    return {
        "brightness": round(float(gray.mean()) / 255, 3),
        # RMS contrast: std of luma; 128 is the max possible (half black, half white).
        "contrast": round(min(float(gray.std()) / 128, 1.0), 3),
        "saturation": round(float(hsv[..., 1].mean()) / 255, 3),
    }


def hist(frame: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    h = cv2.calcHist([hsv], [0, 1], None, [32, 32], [0, 180, 0, 256])
    return cv2.normalize(h, h).flatten()


def label(m: dict) -> str:
    if m["brightness"] < 0.25:
        return "Dark scene"
    if m["brightness"] > 0.75:
        return "Very bright scene"
    if m["saturation"] < 0.25:
        return "Muted colours"
    return "Balanced scene"


def analyze(video: Path, clip_id: str) -> list[dict]:
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise RuntimeError(f"cannot open {video}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    step = max(1, round(fps * SAMPLE_EVERY_S))

    samples, prev_hist, i = [], None, 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if i % step == 0:
            h = hist(frame)
            change = prev_hist is not None and cv2.compareHist(prev_hist, h, cv2.HISTCMP_CORREL) < SCENE_CHANGE_CORREL
            m = measure(frame)
            samples.append({"clipId": clip_id, "timestamp": round(i / fps, 2), **m, "sceneChange": bool(change), "label": label(m)})
            prev_hist = h
        i += 1
    cap.release()
    if not samples:
        raise RuntimeError(f"no frames read from {video}")
    return samples


def self_test(tmp: Path) -> None:
    """3 s dark grey then 3 s saturated bright yellow: expect dark→bright and one cut at 3 s."""
    path = tmp / "selftest.avi"
    out = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), 10, (64, 36))
    for i in range(60):
        out.write(np.full((36, 64, 3), (30, 30, 30) if i < 30 else (40, 230, 240), np.uint8))
    out.release()

    s = analyze(path, "selftest")
    assert [x["timestamp"] for x in s] == [0, 1, 2, 3, 4, 5], s
    assert s[0]["brightness"] < 0.25 and s[0]["label"] == "Dark scene", s[0]
    assert s[5]["brightness"] > 0.6 and s[5]["saturation"] > 0.6, s[5]
    assert [x["sceneChange"] for x in s] == [False, False, False, True, False, False], s
    print("self-test passed")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("media_dir", nargs="?", type=Path)
    p.add_argument("--out", type=Path, default=Path(__file__).parent / "scenes")
    p.add_argument("--self-test", action="store_true")
    args = p.parse_args()

    if args.self_test:
        import tempfile

        with tempfile.TemporaryDirectory() as d:
            self_test(Path(d))
        return 0
    if not args.media_dir:
        p.error("media_dir is required (or use --self-test)")

    videos = sorted(args.media_dir.expanduser().glob("*/original.mp4"))
    if not videos:
        print(f"no */original.mp4 under {args.media_dir}", file=sys.stderr)
        return 1
    args.out.mkdir(parents=True, exist_ok=True)
    for video in videos:
        clip_id = video.parent.name
        samples = analyze(video, clip_id)
        (args.out / f"{clip_id}.json").write_text(json.dumps(samples, indent=1))
        cuts = sum(s["sceneChange"] for s in samples)
        print(f"{clip_id}: {len(samples)} samples, {cuts} scene changes → {args.out / clip_id}.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
