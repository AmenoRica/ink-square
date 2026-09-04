#!/usr/bin/env python3
"""Train the tiny causal residual post-filter shipped with the browser demo."""

import json
import sys
import wave
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F


def read_mono(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as source:
        if source.getsampwidth() != 2:
            raise ValueError("expected 16-bit PCM WAV")
        channels = source.getnchannels()
        samples = np.frombuffer(source.readframes(source.getnframes()), dtype="<i2")
    return samples.reshape(-1, channels).mean(axis=1).astype(np.float32) / 32768


class PostFilter(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.first = nn.Conv1d(1, 8, 9, bias=False)
        self.second = nn.Conv1d(8, 1, 9, bias=False)

    def forward(self, signal: torch.Tensor) -> torch.Tensor:
        hidden = torch.tanh(self.first(F.pad(signal, (8, 0))))
        residual = self.second(F.pad(hidden, (8, 0)))
        return signal + residual * 0.32


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: train-city-postfilter.py VOCALS.wav OUTPUT.json")
    source = read_mono(Path(sys.argv[1]))
    frame = 4096
    frames = source[: len(source) // frame * frame].reshape(-1, frame)
    active = frames[np.sqrt(np.mean(frames * frames, axis=1)) > 0.012]
    if len(active) < 20:
        raise ValueError("not enough active vocal audio")
    rng = np.random.default_rng(20260904)
    rng.shuffle(active)
    target = active[: min(len(active), 366)].reshape(-1)

    taps = np.arange(25) - 12
    cutoff = 0.13
    kernel = np.sinc(2 * cutoff * taps) * np.hamming(len(taps))
    kernel /= kernel.sum()
    degraded = np.convolve(target, kernel, mode="same")
    degraded = np.tanh(degraded * 1.35) / np.tanh(1.35)
    degraded = np.round(degraded * 2048) / 2048

    clean = torch.from_numpy(target).view(1, 1, -1)
    colored = torch.from_numpy(degraded.astype(np.float32)).view(1, 1, -1)
    model = PostFilter()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.003)
    generator = torch.Generator().manual_seed(20260904)
    window = 4096
    for _ in range(420):
        starts = torch.randint(0, clean.shape[-1] - window, (12,), generator=generator)
        batch_x = torch.cat([colored[..., start:start + window] for start in starts])
        batch_y = torch.cat([clean[..., start:start + window] for start in starts])
        prediction = model(batch_x)
        loss = F.l1_loss(prediction, batch_y) + F.l1_loss(torch.diff(prediction), torch.diff(batch_y)) * 0.35
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

    with torch.no_grad():
        before = F.l1_loss(colored[..., :200_000], clean[..., :200_000]).item()
        after = F.l1_loss(model(colored[..., :200_000]), clean[..., :200_000]).item()
    weights = {
        "name": "city-of-color-causal-residual-v1",
        "mix": 0.32,
        "kernelSize": 9,
        "firstWeight": model.first.weight.detach().flatten().tolist(),
        "firstBias": [0.0] * 8,
        "secondWeight": model.second.weight.detach().flatten().tolist(),
        "secondBias": [0.0],
    }
    Path(sys.argv[2]).write_text(json.dumps(weights, separators=(",", ":")) + "\n")
    print(f"active_frames={len(active)} l1_before={before:.6f} l1_after={after:.6f}")


if __name__ == "__main__":
    main()
